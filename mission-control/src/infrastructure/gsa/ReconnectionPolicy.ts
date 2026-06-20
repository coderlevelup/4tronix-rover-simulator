export class ReconnectionPolicy {
  // TODO: User Story 64 / Task 67 - exponential backoff and heartbeat logic.
  nextDelay(_attempt: number): number {
    void _attempt;
    return 0;
  }
}
