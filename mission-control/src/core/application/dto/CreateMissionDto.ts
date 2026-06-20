/**
 * Data Transfer Object for Mission Creation
 * Used for mission submission (from authoring repo to mission-control)
 */
export interface CreateMissionDto {
  yardId: string;
  sessionId: string;
  code: string;
  challengeId?: string;
}
