import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import {
  adminClearDepartments,
  adminCreateDepartment,
  adminDeleteDepartment,
  adminGetDepartments,
  serializeDepartment,
} from '@/lib/firebase/departments';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const departments = await adminGetDepartments();
  return NextResponse.json({ success: true, data: departments.map(serializeDepartment) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { name } = await req.json();
    const department = await adminCreateDepartment(String(name ?? ''));
    return NextResponse.json({ success: true, data: serializeDepartment(department) }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to create department' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get('all') === 'true';

    if (all) {
      await adminClearDepartments();
      return NextResponse.json({ success: true });
    }

    const id = searchParams.get('id');
    if (!id) throw new Error('Department id is required');

    await adminDeleteDepartment(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message ?? 'Failed to delete department' }, { status: 400 });
  }
}
