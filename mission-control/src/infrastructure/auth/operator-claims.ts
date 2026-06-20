import type { OperatorClaims } from '@/core/domain/entities/OperatorRole';
import type { NextRequest } from 'next/server';

export const OPERATOR_ACCESS_HEADER = 'x-operator-role';
export const OPERATOR_YARDS_HEADER = 'x-operator-yards';
export const OPERATOR_ID_HEADER = 'x-operator-id';

export function readOperatorClaimsFromHeaders(headers: Headers): OperatorClaims | null {
  const role = headers.get(OPERATOR_ACCESS_HEADER);

  if (!role) {
    return null;
  }

  const yardIds = headers
    .get(OPERATOR_YARDS_HEADER)
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (role !== 'learner' && role !== 'operator' && role !== 'admin') {
    return null;
  }

  return {
    role,
    yardIds,
  };
}

export async function verifyOperatorAuth(request: NextRequest): Promise<string> {
  const userId = request.headers.get(OPERATOR_ID_HEADER);
  const claims = readOperatorClaimsFromHeaders(request.headers);

  if (!userId || !claims) {
    throw new Error('Unauthorized');
  }

  return userId;
}
