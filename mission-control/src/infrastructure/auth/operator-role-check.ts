import type { OperatorClaims } from '@/core/domain/entities/OperatorRole';
import { readOperatorClaimsFromHeaders } from '@/infrastructure/auth/operator-claims';

export function isProtectedOperatorRoute(pathname: string): boolean {
  return pathname.startsWith('/operator') || pathname.startsWith('/api/operator');
}

export function hasOperatorAccess(claims: OperatorClaims | null): boolean {
  return claims?.role === 'operator' || claims?.role === 'admin';
}

export function resolveOperatorAccess(headers: Headers): OperatorClaims | null {
  return readOperatorClaimsFromHeaders(headers);
}
