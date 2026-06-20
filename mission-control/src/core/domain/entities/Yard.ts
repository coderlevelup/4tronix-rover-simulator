export type YardStatus = 'offline' | 'remote' | 'on-site';

export interface Yard {
  id: string;
  name: string;
  status: YardStatus;
  currentMissionId?: string;
  assignedOperatorId?: string;
}
