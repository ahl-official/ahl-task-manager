import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminGetAllUsers, adminCreateUser, adminDeleteUser, adminGetUserByUid, adminUpdateUser, normalizeWa, waLast10 } from '@/lib/firebase/users';
import { adminAuth } from '@/lib/firebase/admin';
import type { AHLUser } from '@/types';
import { filterUsersForSession } from '@/lib/utils/access';
import { hasCloudflareApi } from '@/lib/cloudflare/api';

function normalizeRole(role: string | undefined) {
  return role === 'user' ? 'member' : role;
}

function userIdFromInput(input: Pick<AHLUser, 'name' | 'waNumber'>) {
  const nameKey = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `user-${nameKey || waLast10(input.waNumber)}`;
}

// GET /api/users
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const users = filterUsersForSession(session, await adminGetAllUsers());
  // Strip sensitive fields for non-admins
  const data = session.role === 'admin'
    ? users
    : users.map(u => ({ uid: u.uid, name: u.name, department: u.department, role: u.role }));

  return NextResponse.json({ success: true, data });
}

// POST /api/users — create user (admin only)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json() as Omit<AHLUser, 'uid' | 'createdAt' | 'updatedAt'>;
    const role = normalizeRole(body.role) as AHLUser['role'];

    if (hasCloudflareApi()) {
      const uid = userIdFromInput(body);
      await adminCreateUser({ ...body, role, uid });
      return NextResponse.json({ success: true, data: { uid } }, { status: 201 });
    }

    // Create Firebase Auth user with WA number as email placeholder
    const authUser = await adminAuth.createUser({
      displayName: body.name,
    });
    await adminCreateUser({ ...body, role, uid: authUser.uid });
    // Set custom claims
    await adminAuth.setCustomUserClaims(authUser.uid, {
      role,
      department: body.department,
      waNumber:   body.waNumber,
      name:       body.name,
    });

    return NextResponse.json({ success: true, data: { uid: authUser.uid } }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/users error', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH /api/users/[uid]
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { uid, ...data } = await req.json();
    if (data.role) data.role = normalizeRole(data.role);
    await adminUpdateUser(uid, data);

    if (!hasCloudflareApi() && (data.role || data.department || data.waNumber || data.name)) {
      const current = await adminAuth.getUser(uid);
      await adminAuth.setCustomUserClaims(uid, {
        ...current.customClaims,
        ...data,
        ...(data.waNumber ? { waNumber: normalizeWa(data.waNumber) } : {}),
      });

      if (data.name) {
        await adminAuth.updateUser(uid, { displayName: data.name });
      }
    }

    const updated = await adminGetUserByUid(uid);
    return NextResponse.json({
      success: true,
      data: updated ? {
        ...updated,
        waNumber: data.waNumber ? normalizeWa(data.waNumber) : updated.waNumber,
        waNumberLast10: data.waNumber ? waLast10(data.waNumber) : updated.waNumberLast10,
        createdAt: updated.createdAt.toDate().toISOString(),
        updatedAt: updated.updatedAt.toDate().toISOString(),
      } : null,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/users?uid=...
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid');
    if (!uid) {
      return NextResponse.json({ success: false, error: 'User id is required' }, { status: 400 });
    }

    if (uid === session.uid) {
      return NextResponse.json({ success: false, error: 'You cannot delete your own admin user.' }, { status: 400 });
    }

    await adminDeleteUser(uid);

    if (!hasCloudflareApi()) {
      try {
        await adminAuth.deleteUser(uid);
      } catch (err: any) {
        if (err?.code !== 'auth/user-not-found') throw err;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to delete user' }, { status: 500 });
  }
}
