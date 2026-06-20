export type RoverType = 'physical' | 'simulator';
export type VisualFeedType = 'camera' | 'simulator';

export interface RoverConfig {
  id: string;
  createdBy: string;
  name: string;
  description?: string;
  roverTag: string;

  // Rover type and connection
  roverType: RoverType;
  ipAddress: string;
  port: number;

  // Visual feed configuration
  visualFeedType: VisualFeedType;
  cameraWsPort?: number;        // WebSocket port for camera stream (physical rovers)
  simulatorEndpoint?: string;   // Custom simulator URL (if different from ipAddress:port)

  // Status flags
  isActive: boolean;
  isPinned: boolean;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
}

export type RoverConfigCreateInput = Omit<
  RoverConfig,
  'id' | 'createdAt' | 'updatedAt' | 'lastConnectedAt'
>;

export type RoverConfigUpdateInput = Partial<
  Omit<RoverConfig, 'id' | 'createdBy' | 'createdAt'>
>;