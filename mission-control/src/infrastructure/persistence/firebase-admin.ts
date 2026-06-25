/**
 * Firebase Admin SDK Initialization
 *
 * Singleton pattern to ensure Firebase Admin is initialized once.
 * Uses service account credentials from environment variables.
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let app: App | undefined;
let firestoreInstance: Firestore | undefined;
let authInstance: Auth | undefined;

type FirebaseAdminConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function normalizeEnvValue(value?: string): string | undefined {
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

function getFirebaseAdminConfig(): FirebaseAdminConfig {
  const projectId = normalizeEnvValue(
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    process.env.REACT_APP_FIREBASE_PROJECT_ID
  );
  const clientEmail = normalizeEnvValue(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalizeEnvValue(process.env.FIREBASE_PRIVATE_KEY);

  const missingVariables: string[] = [];

  if (!projectId) {
    missingVariables.push('FIREBASE_PROJECT_ID');
  }

  if (!clientEmail) {
    missingVariables.push('FIREBASE_CLIENT_EMAIL');
  }

  if (!privateKey) {
    missingVariables.push('FIREBASE_PRIVATE_KEY');
  }

  if (missingVariables.length > 0) {
    throw new Error(
      [
        `Missing Firebase Admin environment variables: ${missingVariables.join(', ')}.`,
        'The /api/missions route uses the Firebase Admin SDK.',
        'Client-side Firebase config such as NEXT_PUBLIC_FIREBASE_* or REACT_APP_FIREBASE_* is not enough on its own.',
        'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your server environment.',
      ].join(' ')
    );
  }

  return {
    projectId: projectId!,
    clientEmail: clientEmail!,
    privateKey: privateKey!,
  };
}

/**
 * Initialize Firebase Admin SDK
 * Safe to call multiple times - only initializes once
 */
export function initializeFirebaseAdmin(): App {
  if (app) {
    return app;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    app = existingApps[0];
    return app;
  }

  const { projectId, clientEmail, privateKey } = getFirebaseAdminConfig();

  app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });

  return app;
}

/**
 * Get Firestore instance
 * Initializes Firebase Admin if not already initialized
 */
export function getFirestoreInstance(): Firestore {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  initializeFirebaseAdmin();
  firestoreInstance = getFirestore();

  return firestoreInstance;
}

/**
 * Get Firebase Admin Auth instance
 * Initializes Firebase Admin if not already initialized.
 * Used by server-side routes for verifying ID tokens and setting custom claims.
 */
export function getFirebaseAdminAuth(): Auth {
  if (authInstance) {
    return authInstance;
  }

  initializeFirebaseAdmin();
  authInstance = getAuth();

  return authInstance;
}
