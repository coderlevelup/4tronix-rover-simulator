export type OperatorRole = 'learner' | 'operator' | 'admin';

export interface OperatorClaims {
  role: OperatorRole;
  yardIds?: string[];
}
