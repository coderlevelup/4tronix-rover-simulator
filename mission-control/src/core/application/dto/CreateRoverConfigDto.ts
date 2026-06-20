import { RoverType, VisualFeedType } from '@/core/domain/entities/RoverConfig';

export interface CreateRoverConfigDto {
  name: string;
  description?: string;
  roverTag: string;
  roverType: RoverType;
  ipAddress: string;
  port: number;
  visualFeedType: VisualFeedType;
  cameraWsPort?: number;
  simulatorEndpoint?: string;
}