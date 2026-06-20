import type { Mission } from '@/core/domain/entities/Mission';

export class CloudRunMissionSocketServer {
  // TODO: User Story 64 / Task 65 - expose a Cloud Run WebSocket endpoint.
  async start(): Promise<void> {
    return;
  }

  async pushMission(_mission: Mission): Promise<void> {
    void _mission;
    return;
  }
}
