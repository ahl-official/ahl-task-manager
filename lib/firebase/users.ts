import {
  collection, doc, getDoc, getDocs, setDoc,
  updateDoc, query, where, orderBy,
} from 'firebase/firestore';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { db } from './client';
import { adminDb } from './admin';
import type { AHLUser } from '@/types';
import { handleFirestoreReadError } from './errors';

const COL = 'users';

// ─── Normalize WA number ────────────────────────────────────────────────────

export function normalizeWa(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function waLast10(raw: string): string {
  const digits = normalizeWa(raw);
  return digits.slice(-10);
}

// ─── Client-side reads ──────────────────────────────────────────────────────

export async function getUserByUid(uid: string): Promise<AHLUser | null> {
  const snap = await getDoc(doc(db, COL, uid));
  if (snap.exists()) return snap.data() as AHLUser;

  const q = query(collection(db, COL), where('uid', '==', uid));
  const byField = await getDocs(q);
  return byField.empty ? null : byField.docs[0].data() as AHLUser;
}

export async function getUserByWaNumber(waInput: string): Promise<AHLUser | null> {
  const last10 = waLast10(waInput);
  const q = query(
    collection(db, COL),
    where('waNumberLast10', '==', last10),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs
    .map(d => d.data() as AHLUser)
    .find(u => u.isActive) ?? null;
}

export async function getAllUsers(): Promise<AHLUser[]> {
  const snap = await getDocs(query(collection(db, COL), orderBy('name')));
  return snap.docs.map(d => d.data() as AHLUser);
}

export async function getActiveUsers(): Promise<AHLUser[]> {
  const q = query(
    collection(db, COL),
    orderBy('name'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as AHLUser).filter(u => u.isActive);
}

// ─── Server-side (Admin SDK) ─────────────────────────────────────────────────

export async function adminGetUserByWa(waInput: string): Promise<AHLUser | null> {
  const last10 = waLast10(waInput);
  const snap = await adminDb
    .collection(COL)
    .where('waNumberLast10', '==', last10)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs
    .map(d => d.data() as AHLUser)
    .find(u => u.isActive) ?? null;
}

export async function adminGetUserByUid(uid: string): Promise<AHLUser | null> {
  const snap = await adminDb.collection(COL).doc(uid).get();
  if (snap.exists) return snap.data() as AHLUser;

  const byField = await adminDb
    .collection(COL)
    .where('uid', '==', uid)
    .limit(1)
    .get();

  return byField.empty ? null : byField.docs[0].data() as AHLUser;
}

export async function adminGetAllUsers(): Promise<AHLUser[]> {
  try {
    const snap = await adminDb.collection(COL).orderBy('name').get();
    return snap.docs.map(d => d.data() as AHLUser);
  } catch (err) {
    handleFirestoreReadError('adminGetAllUsers', err);
    return [];
  }
}

export async function adminCreateUser(user: Omit<AHLUser, 'createdAt' | 'updatedAt'>): Promise<void> {
  const now = AdminTimestamp.now();
  await adminDb.collection(COL).doc(user.uid).set({
    ...user,
    waNumber: normalizeWa(user.waNumber),
    waNumberLast10: waLast10(user.waNumber),
    createdAt: now,
    updatedAt: now,
  });
}

export async function adminUpdateUser(uid: string, data: Partial<AHLUser>): Promise<void> {
  const updateData: Partial<AHLUser> & Record<string, unknown> = { ...data };

  if (typeof data.waNumber === 'string') {
    updateData.waNumber = normalizeWa(data.waNumber);
    updateData.waNumberLast10 = waLast10(data.waNumber);
  }

  let ref = adminDb.collection(COL).doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    const byField = await adminDb
      .collection(COL)
      .where('uid', '==', uid)
      .limit(1)
      .get();
    if (byField.empty) throw new Error('User not found');
    ref = byField.docs[0].ref;
  }

  await ref.update({
    ...updateData,
    updatedAt: AdminTimestamp.now(),
  });
}
