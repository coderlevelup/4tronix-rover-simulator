/**
 * Firebase Admin SDK for Authentication
 *
 * Provides Firebase Admin SDK initialization with Auth support.
 * Used by server-side routes for operations like setting custom claims.
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';

let app: App | undefined;
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
        'Server-side operations require Firebase Admin SDK credentials.',
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
 * Get Firebase Admin instance
 */
export function getFirebaseAdmin(): App {
  if (app) {
    return app;
  }

  return initializeFirebaseAdmin();
}

/**
 * Get Firebase Admin Auth instance
 */
export function getFirebaseAdminAuth(): Auth {
  if (authInstance) {
    return authInstance;
  }

  initializeFirebaseAdmin();
  authInstance = getAuth(app);

  return authInstance;
}
