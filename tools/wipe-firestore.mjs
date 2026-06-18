import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const root = process.cwd();
const envPath = path.join(root, '.env.local');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function countCollection(collectionRef) {
  let total = 0;
  let lastDoc = null;
  const pageSize = 500;

  while (true) {
    let query = collectionRef.orderBy('__name__').limit(pageSize);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    total += snap.size;
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  return total;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const confirmed = process.env.CONFIRM_WIPE === 'DELETE_FIRESTORE';

  loadEnvFile(envPath);

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: required('FIREBASE_PROJECT_ID'),
        clientEmail: required('FIREBASE_CLIENT_EMAIL'),
        privateKey: required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
  }

  const db = getFirestore();
  const collections = await db.listCollections();

  if (!collections.length) {
    console.log('No root Firestore collections found.');
    return;
  }

  console.log(`Firestore project: ${required('FIREBASE_PROJECT_ID')}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'DELETE'}`);
  console.log('');

  const counts = [];
  for (const collectionRef of collections) {
    const count = await countCollection(collectionRef);
    counts.push({ id: collectionRef.id, count });
    console.log(`${collectionRef.id}: ${count} root docs`);
  }

  const total = counts.reduce((sum, item) => sum + item.count, 0);
  console.log('');
  console.log(`Total root docs: ${total}`);

  if (dryRun) {
    console.log('Dry run only. Nothing was deleted.');
    return;
  }

  if (!confirmed) {
    throw new Error(
      'Refusing to delete. Re-run with environment variable CONFIRM_WIPE=DELETE_FIRESTORE.',
    );
  }

  console.log('');
  console.log('Deleting all root collections recursively...');

  for (const collectionRef of collections) {
    console.log(`Deleting collection: ${collectionRef.id}`);
    await db.recursiveDelete(collectionRef);
  }

  console.log('Firestore wipe complete.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
