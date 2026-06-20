import type { Mission } from '@/core/domain/entities/Mission';

export class GroundStationClient {
  // TODO: User Story 64 / Task 66 - implement the Raspberry Pi WebSocket client.
  async connect(): Promise<void> {
    return;
  }

  async sendMission(_mission: Mission): Promise<void> {
    void _mission;
    return;
  }
}
