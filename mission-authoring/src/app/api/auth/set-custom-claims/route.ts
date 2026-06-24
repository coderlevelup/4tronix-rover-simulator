/**
 * API Route for Setting Custom Claims
 *
 * Admin endpoint for assigning roles to Firebase users.
 * Should be called when a user's role is updated in Firestore.
 *
 * SECURITY NOTE: This endpoint is locked behind ADMIN_API_SECRET and fails
 * closed - if the secret is unset server-side, every request is denied. Do NOT
 * expose this to client-side requests without proper validation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { setUserRole, setUserCustomClaims } from '@/infrastructure/auth/set-custom-claims';

interface SetClaimsRequest {
  uid: string;
  role?: 'learner' | 'operator' | 'admin';
  yardIds?: string[];
}

/**
 * POST - Set custom claims for a user
 *
 * Request body:
 * {
 *   "uid": "firebase-user-id",
 *   "role": "operator",
 *   "yardIds": ["yard-1", "yard-2"]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Backend-only endpoint: require a shared secret so a client cannot grant
    // itself an elevated role. The secret must be configured server-side;
    // if it is missing we fail closed (deny) rather than open.
    const expectedSecret = process.env.ADMIN_API_SECRET;
    const authHeader = request.headers.get('authorization') ?? '';
    const presentedSecret = authHeader.replace(/^Bearer\s+/i, '');

    if (!expectedSecret || presentedSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body: SetClaimsRequest = await request.json();
    const { uid, role, yardIds } = body;

    if (!uid || typeof uid !== 'string') {
      return NextResponse.json(
        { error: 'Invalid user ID provided' },
        { status: 400 }
      );
    }

    if (!role && (!yardIds || yardIds.length === 0)) {
      return NextResponse.json(
        { error: 'Either role or yardIds must be provided' },
        { status: 400 }
      );
    }

    // Build the claims object
    const claims: any = {};
    if (role) {
      if (!['learner', 'operator', 'admin'].includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role provided' },
          { status: 400 }
        );
      }
      claims.role = role;
    }

    if (yardIds && Array.isArray(yardIds) && yardIds.length > 0) {
      claims.yardIds = yardIds;
    }

    // Set the custom claims
    await setUserCustomClaims(uid, claims);

    return NextResponse.json(
      {
        success: true,
        message: 'Custom claims set successfully',
        uid,
        claims,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('❌ Failed to set custom claims:', error);

    if (error.code === 'auth/user-not-found') {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to set custom claims' },
      { status: 500 }
    );
  }
}
