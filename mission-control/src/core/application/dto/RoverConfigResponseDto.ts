export interface RoverConfigResponseDto {
  id: string;
  name: string;
  description?: string;
  roverTag: string;
  ipAddress: string;
  port: number;
  isActive: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
}