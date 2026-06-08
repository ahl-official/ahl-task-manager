import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './admin';
import { handleFirestoreReadError } from './errors';
import { cachedFirestoreRead, clearFirestoreReadCache } from './readCache';

const COL = 'departments';

export const DEFAULT_DEPARTMENTS: string[] = [];

function slugifyDepartment(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface Department {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export async function adminGetDepartments(): Promise<Department[]> {
  try {
    return await cachedFirestoreRead('departments:all', 5 * 60 * 1000, async () => {
      const snap = await adminDb.collection(COL).orderBy('name').get();
      const custom = snap.docs.map(d => d.data() as Department);

      return custom
        .filter(d => d.isActive)
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  } catch (err) {
    handleFirestoreReadError('adminGetDepartments', err);
    return [];
  }
}

export async function adminCreateDepartment(name: string): Promise<Department> {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  if (!cleanName) throw new Error('Department name is required');

  const id = slugifyDepartment(cleanName);
  if (!id) throw new Error('Department name must contain letters or numbers');

  const existing = await adminDb.collection(COL).doc(id).get();
  if (existing.exists) throw new Error('Department already exists');

  const duplicate = (await adminGetDepartments())
    .some(d => d.name.toLowerCase() === cleanName.toLowerCase());
  if (duplicate) throw new Error('Department already exists');

  const now = Timestamp.now();
  const department: Department = {
    id,
    name: cleanName,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await adminDb.collection(COL).doc(id).set(department);
  clearFirestoreReadCache('departments:');
  return department;
}

export async function adminDeleteDepartment(id: string): Promise<void> {
  const cleanId = id.trim();
  if (!cleanId) throw new Error('Department id is required');

  const ref = adminDb.collection(COL).doc(cleanId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Department not found');

  const department = snap.data() as Department;
  const users = await adminDb.collection('users').where('department', '==', department.name).get();
  const batch = adminDb.batch();

  batch.delete(ref);
  users.docs.forEach(doc => {
    batch.update(doc.ref, {
      department: '',
      updatedAt: Timestamp.now(),
    });
  });

  await batch.commit();
  clearFirestoreReadCache('departments:');
  clearFirestoreReadCache('users:');
  clearFirestoreReadCache('scores:');
  clearFirestoreReadCache('tasks:');
}

export async function adminClearDepartments(): Promise<void> {
  const [departments, users] = await Promise.all([
    adminDb.collection(COL).get(),
    adminDb.collection('users').get(),
  ]);
  const batch = adminDb.batch();

  departments.docs.forEach(doc => batch.delete(doc.ref));
  users.docs.forEach(doc => {
    batch.update(doc.ref, {
      department: '',
      updatedAt: Timestamp.now(),
    });
  });

  await batch.commit();
  clearFirestoreReadCache('departments:');
  clearFirestoreReadCache('users:');
  clearFirestoreReadCache('scores:');
  clearFirestoreReadCache('tasks:');
}

export function serializeDepartment(department: Department) {
  return {
    ...department,
    createdAt: department.createdAt.toDate().toISOString(),
    updatedAt: department.updatedAt.toDate().toISOString(),
  };
}
