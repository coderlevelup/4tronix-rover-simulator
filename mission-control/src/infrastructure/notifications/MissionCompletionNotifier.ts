import type { Mission } from '@/core/domain/entities/Mission';

export class MissionCompletionNotifier {
  // TODO: User Story 58 / Task 60 - implement optional email notifications for completed missions.
  async sendCompletionNotification(_mission: Mission): Promise<void> {
    void _mission;
    return;
  }
}
