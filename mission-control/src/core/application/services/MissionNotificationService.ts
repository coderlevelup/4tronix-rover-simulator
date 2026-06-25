import type { Mission } from '@/core/domain/entities/Mission';

export class MissionNotificationService {
  // TODO: User Story 58 / Task 59 - emit mission completion events.
  // TODO: User Story 58 / Task 60 - send optional email notifications.
  async handleMissionCompleted(_mission: Mission): Promise<void> {
    void _mission;
    return;
  }
}
