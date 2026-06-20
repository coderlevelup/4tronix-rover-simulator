import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, JWTPayload, importX509, decodeProtectedHeader } from 'jose';
import {
  isProtectedOperatorRoute,
} from '@/infrastructure/auth/operator-role-check';
import {
  OPERATOR_ACCESS_HEADER,
  OPERATOR_YARDS_HEADER,
  OPERATOR_ID_HEADER,
} from '@/infrastructure/auth/operator-claims';

/**
 * Caches to improve verification performance (Edge-compatible).
 * These will persist across some requests within the same isolate.
 */
let cachedCertMapping: Record<string, string> | null = null;
let certMappingExpiry: number = 0;

// Simple memory cache for verified tokens.
// Map<token, { payload: JWTPayload, exp: number }>
const tokenVerificationCache = new Map<string, { payload: JWTPayload; exp: number }>();

/**
 * Fetch and cache Firebase certificates
 */
async function getFirebaseCertificates(): Promise<Record<string, string> | null> {
  const now = Date.now();
  
  // Return cached certificates if they are still valid
  if (cachedCertMapping && now < certMappingExpiry) {
    return cachedCertMapping;
  }

  try {
    const jwksUrl = `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`;
    const response = await fetch(jwksUrl);
    
    if (!response.ok) {
      console.error('❌ Failed to fetch Firebase certificates');
      return null;
    }

    // Try to parse max-age from Cache-Control header, default to 1 hour
    const cacheControl = response.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    const ttlSeconds = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;
    
    const certMapping = await response.json();
    
    if (!certMapping || typeof certMapping !== 'object') {
      console.error('❌ Invalid Firebase certificate response');
      return null;
    }

    // Update cache
    cachedCertMapping = certMapping;
    certMappingExpiry = now + (ttlSeconds * 1000);
    
    return certMapping;
  } catch (error) {
    console.error('❌ Error fetching Firebase certificates:', error);
    return null;
  }
}

/**
 * Alternative approach using jose's built-in JWK support, with caching.
 */
async function decodeSessionTokenV2(token: string): Promise<JWTPayload | null> {
  const nowSeconds = Math.floor(Date.now() / 1000);

  // 1. Check fast token cache first
  const cached = tokenVerificationCache.get(token);
  if (cached) {
    if (cached.exp > nowSeconds) {
      return cached.payload; // Cache hit and still valid
    } else {
      tokenVerificationCache.delete(token); // Clean up expired
    }
  }

  try {
    const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!firebaseProjectId) {
      console.error('❌ NEXT_PUBLIC_FIREBASE_PROJECT_ID not configured');
      return null;
    }

    // 2. Get Firebase certificates (uses cache internally)
    const certMapping = await getFirebaseCertificates();
    
    if (!certMapping) {
      return null;
    }

    // Decode the JWT header to find the signing key id.
    // decodeProtectedHeader is Edge- and Node-compatible (no Buffer / node:crypto).
    const { kid } = decodeProtectedHeader(token);
    if (!kid) {
      console.error('❌ Token missing kid header');
      return null;
    }

    // Find the matching x509 cert from Google's published certificates
    const cert = certMapping[kid];
    if (!cert || typeof cert !== 'string') {
      console.error('❌ Token key not found in Firebase certificates');
      return null;
    }

    // Import the PEM x509 certificate as a public key (Edge-compatible)
    const publicKey = await importX509(cert, 'RS256');

    // Verify signature AND the standard Firebase issuer/audience claims
    const verified = await jwtVerify(token, publicKey, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      audience: firebaseProjectId,
    });
    const payload = verified.payload;

    // 3. Add to verification cache if it has an expiration
    if (payload.exp) {
      tokenVerificationCache.set(token, { payload, exp: payload.exp as number });
      
      // Prevent unbounded growth of cache (basic safeguard)
      if (tokenVerificationCache.size > 1000) {
        // Find and remove a chunk of oldest entries
        const iterator = tokenVerificationCache.keys();
        for (let i = 0; i < 100; i++) {
          const key = iterator.next().value;
          if (key) tokenVerificationCache.delete(key);
        }
      }
    }

    return payload;
  } catch (error) {
    console.error('❌ Token verification failed:', error);
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';

  if (!isProtectedOperatorRoute(pathname)) {
    return NextResponse.next();
  }

  // Try to get the session cookie
  const sessionCookie = request.cookies.get('session')?.value;

  if (!sessionCookie) {
    console.warn('⚠️ No session cookie found, redirecting to login');
    return NextResponse.redirect(loginUrl);
  }

  // Decode and verify the session token
  const decodedToken = await decodeSessionTokenV2(sessionCookie);

  if (!decodedToken) {
    console.error('❌ Failed to verify session token');
    return NextResponse.redirect(loginUrl);
  }

  // Extract the role claim
  const role = decodedToken.role as string | undefined;

  if (!role || (role !== 'operator' && role !== 'admin')) {
    console.warn('⚠️ User does not have operator access, role:', role);
    return NextResponse.redirect(loginUrl);
  }

  // User has valid operator role. Build trusted claim headers from the VERIFIED
  // token only. We first delete any operator headers the client may have tried
  // to smuggle in, then set values derived from the decoded JWT — so downstream
  // routes that read these headers can trust them.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(OPERATOR_ACCESS_HEADER);
  requestHeaders.delete(OPERATOR_YARDS_HEADER);
  requestHeaders.delete(OPERATOR_ID_HEADER);

  requestHeaders.set(OPERATOR_ACCESS_HEADER, role);

  // Operator id comes from the token subject (Firebase uid), never the client.
  const operatorId = (decodedToken.user_id ?? decodedToken.sub ?? decodedToken.uid) as
    | string
    | undefined;
  if (operatorId) {
    requestHeaders.set(OPERATOR_ID_HEADER, operatorId);
  }

  // Also set yard IDs if available
  const yardIds = decodedToken.yardIds as string[] | undefined;
  if (yardIds && yardIds.length > 0) {
    requestHeaders.set(OPERATOR_YARDS_HEADER, yardIds.join(','));
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ['/operator/:path*', '/api/operator/:path*'],
};
