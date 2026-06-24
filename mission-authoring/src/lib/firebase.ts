/**
 * Firebase Client SDK Initialization
 *
 * Client-side Firebase configuration for authentication.
 * Uses NEXT_PUBLIC_* environment variables accessible in the browser.
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { initializeFirestore, getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate Firebase config in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const missingVars = [];
  if (!firebaseConfig.apiKey) missingVars.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  if (!firebaseConfig.authDomain) missingVars.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  if (!firebaseConfig.projectId) missingVars.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');

  if (missingVars.length > 0) {
    console.error('❌ Missing Firebase client config:', missingVars.join(', '));
    console.error('Make sure these are set in your .env file and restart the dev server');
  }
}

let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;

/**
 * Initialize Firebase client SDK
 * Safe to call multiple times - only initializes once
 */
export function initializeFirebaseClient(): FirebaseApp {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  return app;
}

/**
 * Get Firebase Auth instance
 */
export function getFirebaseAuth(): Auth {
  if (!auth) {
    initializeFirebaseClient();
    auth = getAuth(app);
  }
  return auth;
}

/**
 * Get Firestore instance
 */
export function getFirestoreClient(): Firestore {
  if (!firestore) {
    initializeFirebaseClient();
    // Force long polling (plain HTTPS) instead of the default gRPC/WebChannel
    // streaming transport. Streaming is blocked by many networks (VPNs,
    // ad-blockers, school/corporate firewalls) and by Node (SSR / API routes),
    // producing "Could not reach Cloud Firestore backend ... offline mode" in
    // the browser and "GrpcConnection RPC 'Listen' stream error" on the server.
    // Long polling gets through all of those; auto-detect still tries streaming
    // first and can fail to recover, so we force it.
    try {
      firestore = initializeFirestore(app, {
        experimentalForceLongPolling: true,
      });
    } catch {
      // initializeFirestore throws if Firestore was already initialised for this
      // app (e.g. across HMR reloads) - fall back to the existing instance.
      firestore = getFirestore(app);
    }
  }
  return firestore;
}
