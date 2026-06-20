import { RoverConfig, RoverConfigCreateInput, RoverConfigUpdateInput } from '../entities/RoverConfig';

export interface IRoverConfigRepository {
  create(userId: string, config: RoverConfigCreateInput): Promise<RoverConfig>;
  findById(id: string): Promise<RoverConfig | null>;
  findByIdAndUserId(id: string, userId: string): Promise<RoverConfig | null>;
  findAllByUserId(userId: string): Promise<RoverConfig[]>;
  findActiveByUserId(userId: string): Promise<RoverConfig | null>;
  update(id: string, userId: string, updates: RoverConfigUpdateInput): Promise<RoverConfig | null>;
  setActive(configId: string, userId: string): Promise<RoverConfig | null>;
  delete(id: string, userId: string): Promise<boolean>;
}
