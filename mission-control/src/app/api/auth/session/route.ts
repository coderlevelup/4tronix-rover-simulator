/**
 * Session Cookie API Route
 *
 * Handles setting secure session cookies with Firebase ID tokens.
 * Called from the client after successful authentication to establish
 * server-side session validation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminAuth } from '@/infrastructure/persistence/firebase-admin';

interface SessionRequest {
  token: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SessionRequest = await request.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Invalid token provided' },
        { status: 400 }
      );
    }

    // Verify the Firebase ID token using Admin SDK
    const auth = getFirebaseAdminAuth();
    const decodedToken = await auth.verifyIdToken(token);

    console.log('✅ Session token verified for user:', decodedToken.email);

    // Create a response and set the secure session cookie
    const response = NextResponse.json(
      { success: true, message: 'Session established' },
      { status: 200 }
    );

    // Set the secure httpOnly cookie with the Firebase ID token
    // Valid for 1 hour (same as Firebase ID token expiration)
    response.cookies.set({
      name: 'session',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60, // 1 hour
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('❌ Session establishment failed:', error);
    const code = (error as { code?: string }).code;

    if (code === 'auth/id-token-expired') {
      return NextResponse.json(
        { error: 'Token expired' },
        { status: 401 }
      );
    }

    if (code === 'auth/id-token-revoked') {
      return NextResponse.json(
        { error: 'Token revoked' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to establish session' },
      { status: 500 }
    );
  }
}
