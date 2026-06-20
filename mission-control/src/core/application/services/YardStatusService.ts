import type { Yard, YardStatus } from '@/core/domain/entities/Yard';

// In-memory storage for yard status (temporary until persistent storage is implemented)
const yardStatusMap = new Map<string, YardStatus>([
  ['yard-1', 'offline'],
]);

export class YardStatusService {
  /**
   * Get the current status of a yard
   * User Story 48 / Task 49 - persist maintenance mode per yard
   *
   * @param yardId - The yard ID
   * @returns The yard status or null if not found
   */
  async getStatus(yardId: string): Promise<YardStatus | null> {
    // TODO: User Story 48 / Task 49 - fetch from persistent storage
    return yardStatusMap.get(yardId) || null;
  }

  /**
   * Check if a yard is offline
   * Offline mode means the yard is switched off and rover cannot move
   *
   * @param yardId - The yard ID
   * @returns True if the yard is offline, false otherwise
   */
  async isOffline(yardId: string): Promise<boolean> {
    const status = await this.getStatus(yardId);
    return status === 'offline';
  }

  /**
   * Check if rover operations are allowed
   * Operations are allowed in remote and on-site modes
   *
   * @param yardId - The yard ID
   * @returns True if rover operations are allowed, false otherwise
   */
  async canOperateRover(yardId: string): Promise<boolean> {
    const status = await this.getStatus(yardId);
    return status === 'remote' || status === 'on-site';
  }

  /**
   * Check if on-site access is allowed
   * On-site mode allows both operator and local tablet access
   *
   * @param yardId - The yard ID
   * @returns True if on-site access is allowed, false otherwise
   */
  async isOnSiteMode(yardId: string): Promise<boolean> {
    const status = await this.getStatus(yardId);
    return status === 'on-site';
  }

  /**
   * Update yard status
   * User Story 48 / Task 49 - persist maintenance mode per yard
   *
   * @param yardId - The yard ID
   * @param status - The new status
   * @returns Updated yard or null if not found
   */
  async updateStatus(yardId: string, status: YardStatus): Promise<Yard | null> {
    // TODO: User Story 48 / Task 49 - persist to storage
    yardStatusMap.set(yardId, status);
    
    return {
      id: yardId,
      name: 'Science Centre Yard',
      status,
    };
  }
}
