#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadEnvConfig } = require('@next/env');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

loadEnvConfig(process.cwd());

const LOCAL_SERVICE_ACCOUNT_PATHS = [
  'service-account.json',
  'firebase-service-account.json',
  'serviceAccountKey.json',
  'firebase-admin-sdk.json',
];

function normalizeEnvValue(value) {
  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1);
  }

  return trimmedValue;
}

function resolveServiceAccountPath() {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? process.argv[2];

  if (configuredPath) {
    const absolutePath = path.resolve(configuredPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_PATH was set, but no file exists at: ${absolutePath}`
      );
    }

    return absolutePath;
  }

  for (const candidate of LOCAL_SERVICE_ACCOUNT_PATHS) {
    const absolutePath = path.resolve(process.cwd(), candidate);

    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  throw new Error(
    [
      'No Firebase service account file was found.',
      'Set FIREBASE_SERVICE_ACCOUNT_PATH to a JSON file, or place one of these files in the project root:',
      LOCAL_SERVICE_ACCOUNT_PATHS.map((candidate) => `- ${candidate}`).join('\n'),
    ].join(' ')
  );
}

function readFirebaseAdminEnvConfig() {
  const projectId = normalizeEnvValue(
    process.env.FIREBASE_PROJECT_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
      process.env.REACT_APP_FIREBASE_PROJECT_ID
  );
  const clientEmail = normalizeEnvValue(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizeEnvValue(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    return undefined;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function readServiceAccount() {
  const serviceAccountPath = resolveServiceAccountPath();
  const raw = fs.readFileSync(serviceAccountPath, 'utf8');

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse Firebase service account JSON at ${serviceAccountPath}: ${error.message}`
    );
  }

  const projectId = parsed.project_id ?? parsed.projectId;
  const clientEmail = parsed.client_email ?? parsed.clientEmail;
  const privateKey = parsed.private_key ?? parsed.privateKey;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      [
        `Firebase service account file at ${serviceAccountPath} is missing required fields.`,
        'Expected project_id, client_email, and private_key.',
      ].join(' ')
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const envConfig = readFirebaseAdminEnvConfig();

  if (envConfig) {
    return initializeApp({
      credential: cert({
        projectId: envConfig.projectId,
        clientEmail: envConfig.clientEmail,
        privateKey: envConfig.privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }

  const serviceAccount = readServiceAccount();

  return initializeApp({
    credential: cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

async function migrateClaims() {
  initializeFirebaseAdmin();

  const firestore = getFirestore();
  const auth = getAuth();

  console.log('Reading users collection from Firestore...');
  const snapshot = await firestore.collection('users').get();

  const totalUsers = snapshot.size;
  let successfulUpdates = 0;
  let failures = 0;

  console.log(`Found ${totalUsers} user document(s).`);

  for (const doc of snapshot.docs) {
    const uid = doc.id;
    const data = doc.data();
    const roleValue = data?.role;

    if (typeof roleValue !== 'string' || roleValue.trim().length === 0) {
      failures += 1;
      console.error(`Skipped user ${uid}: missing or invalid role field.`);
      continue;
    }

    const normalizedRole = roleValue.trim();

    try {
      await auth.setCustomUserClaims(uid, { role: normalizedRole });
      successfulUpdates += 1;
      console.log(`Updated user ${uid} with role ${normalizedRole}`);
    } catch (error) {
      failures += 1;

      const reason = error?.code === 'auth/user-not-found'
        ? 'user does not exist in Firebase Auth'
        : error?.message || 'unknown error';

      console.error(`Failed to update user ${uid}: ${reason}`);
    }
  }

  console.log('Migration complete.');
  console.log(`Total users processed: ${totalUsers}`);
  console.log(`Successful updates: ${successfulUpdates}`);
  console.log(`Failures: ${failures}`);

  if (failures > 0) {
    process.exitCode = 1;
  }
}

migrateClaims().catch((error) => {
  console.error('Migration failed unexpectedly:', error.message);
  process.exitCode = 1;
});