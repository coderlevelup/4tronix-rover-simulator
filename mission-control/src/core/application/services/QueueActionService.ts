import type { QueueAction } from '@/core/domain/entities/QueueAction';
import type { Mission } from '@/core/domain/entities/Mission';

export class QueueActionService {
  // TODO: User Story 82 / Task 84 - implement execute, skip, and hold queue actions.
  // TODO: User Story 77 / Task 79 - pass through emergency stop actions when needed.
  async applyAction(_missionId: string, _action: QueueAction): Promise<Mission | null> {
    void _missionId;
    void _action;
    return null;
  }
}
