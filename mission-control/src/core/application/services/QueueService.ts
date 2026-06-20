import type { Mission } from '@/core/domain/entities/Mission';

export class QueueService {
  // TODO: User Story 43 / Task 45 - load the ordered queue for a yard.
  // TODO: User Story 43 / Task 46 - codify FIFO ordering rules.
  async getQueueForYard(_yardId: string): Promise<Mission[]> {
    void _yardId;
    return [];
  }
}
