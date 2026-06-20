import { IRoverConfigRepository } from '@/core/domain/repositories/IRoverConfigRepository';
import { RoverConfig } from '@/core/domain/entities/RoverConfig';
import { CreateRoverConfigDto } from '@/core/application/dto/CreateRoverConfigDto';
import { UpdateRoverConfigDto } from '@/core/application/dto/UpdateRoverConfigDto';

export interface SetActiveResult {
  success: boolean;
  config?: RoverConfig;
  error?: string;
}

export class RoverConfigService {
  constructor(private readonly roverConfigRepository: IRoverConfigRepository) {}

  async createConfig(
    userId: string,
    dto: CreateRoverConfigDto
  ): Promise<{ success: boolean; config?: RoverConfig; error?: string }> {
    try {
      const config = await this.roverConfigRepository.create(userId, {
        ...dto,
        createdBy: userId,
        isActive: false,
        isPinned: false,
      });

      return { success: true, config };
    } catch (error) {
      return { success: false, error: 'Failed to create config' };
    }
  }

  async getConfigs(userId: string): Promise<RoverConfig[]> {
    return this.roverConfigRepository.findAllByUserId(userId);
  }

  async updateConfig(
    userId: string,
    configId: string,
    dto: UpdateRoverConfigDto
  ): Promise<{ success: boolean; config?: RoverConfig; error?: string }> {
    const existing = await this.roverConfigRepository.findByIdAndUserId(configId, userId);
    if (!existing) {
      return { success: false, error: 'Config not found' };
    }

    try {
      const config = await this.roverConfigRepository.update(configId, userId, {
        ...dto,
        updatedAt: new Date().toISOString(),
      });

      return { success: true, config: config! };
    } catch (error) {
      return { success: false, error: 'Failed to update config' };
    }
  }

  async setActive(userId: string, configId: string): Promise<SetActiveResult> {
    const existing = await this.roverConfigRepository.findByIdAndUserId(configId, userId);
    if (!existing) {
      return { success: false, error: 'Config not found' };
    }

    try {
      const config = await this.roverConfigRepository.setActive(configId, userId);
      return { success: true, config: config! };
    } catch (error) {
      return { success: false, error: 'Failed to set active config' };
    }
  }

  async deleteConfig(userId: string, configId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const deleted = await this.roverConfigRepository.delete(configId, userId);
      if (!deleted) {
        return { success: false, error: 'Config not found' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to delete config' };
    }
  }
}
