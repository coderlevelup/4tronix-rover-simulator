import { useCallback, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { RoverConfig } from '@/core/domain/entities/RoverConfig';
import { CreateRoverConfigDto } from '@/core/application/dto/CreateRoverConfigDto';
import { UpdateRoverConfigDto } from '@/core/application/dto/UpdateRoverConfigDto';
import {
  OPERATOR_ID_HEADER,
  OPERATOR_ACCESS_HEADER,
  OPERATOR_YARDS_HEADER,
} from '@/infrastructure/auth/operator-claims';

interface UseRoverConfigState {
  configs: RoverConfig[];
  activeConfig: RoverConfig | null;
  loading: boolean;
  error: string | null;
}

export function useRoverConfig() {
  const { operatorId, operatorRole, operatorYards } = useAuth();
  const [state, setState] = useState<UseRoverConfigState>({
    configs: [],
    activeConfig: null,
    loading: true,
    error: null,
  });

  const buildHeaders = useCallback(() => {
    if (!operatorId || !operatorRole) return {};
    const headers: Record<string, string> = {
      [OPERATOR_ID_HEADER]: operatorId,
      [OPERATOR_ACCESS_HEADER]: operatorRole,
    };
    if (operatorYards?.length) {
      headers[OPERATOR_YARDS_HEADER] = operatorYards.join(',');
    }
    return headers;
  }, [operatorId, operatorRole, operatorYards]);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/operator/rover-configs', {
        headers: buildHeaders() as HeadersInit,
      });
      const data = await res.json();

      if (data.success) {
        const active = data.configs.find((c: RoverConfig) => c.isActive);
        setState({
          configs: data.configs,
          activeConfig: active || null,
          loading: false,
          error: null,
        });
      } else {
        setState((s: UseRoverConfigState) => ({ ...s, error: data.error, loading: false }));
      }
    } catch (error) {
      setState((s: UseRoverConfigState) => ({
        ...s,
        error: 'Failed to fetch configs',
        loading: false,
      }));
    }
  }, [buildHeaders]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const createConfig = useCallback(
    async (config: CreateRoverConfigDto) => {
      try {
        const res = await fetch('/api/operator/rover-configs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...buildHeaders() },
          body: JSON.stringify(config),
        });

        if (!res.ok) throw new Error('Failed to create');

        const data = await res.json();
        if (data.success) {
          setState((s: UseRoverConfigState) => ({
            ...s,
            configs: [data.config, ...s.configs],
          }));
          return data.config;
        }
      } catch (error) {
        setState((s: UseRoverConfigState) => ({
          ...s,
          error: error instanceof Error ? error.message : 'Create failed',
        }));
      }
    },
    [buildHeaders]
  );

  const setActive = useCallback(async (configId: string) => {
    try {
      const res = await fetch('/api/operator/rover-configs/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildHeaders() },
        body: JSON.stringify({ configId }),
      });

      if (!res.ok) throw new Error('Failed to set active');

      const data = await res.json();
      if (data.success) {
        setState((s: UseRoverConfigState) => ({
          ...s,
          activeConfig: data.config,
          configs: s.configs.map((c: RoverConfig) => ({
            ...c,
            isActive: c.id === configId,
          })),
        }));
        return data.config;
      }
    } catch (error) {
      setState((s: UseRoverConfigState) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Set active failed',
      }));
    }
  }, [buildHeaders]);

  const updateConfig = useCallback(async (configId: string, config: UpdateRoverConfigDto) => {
    try {
      const res = await fetch(`/api/operator/rover-configs/${configId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...buildHeaders() },
        body: JSON.stringify(config),
      });

      if (!res.ok) throw new Error('Failed to update');

      const data = await res.json();
      if (data.success) {
        setState((s: UseRoverConfigState) => ({
          ...s,
          configs: s.configs.map((c: RoverConfig) => c.id === configId ? data.config : c),
          activeConfig: data.config.isActive ? data.config : s.activeConfig,
        }));
        return data.config;
      }
    } catch (error) {
      setState((s: UseRoverConfigState) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Update failed',
      }));
    }
  }, [buildHeaders]);

  const deleteConfig = useCallback(async (configId: string) => {
    try {
      const res = await fetch(`/api/operator/rover-configs/${configId}`, {
        method: 'DELETE',
        headers: buildHeaders() as HeadersInit,
      });

      if (!res.ok) throw new Error('Failed to delete');

      setState((s: UseRoverConfigState) => ({
        ...s,
        configs: s.configs.filter((c: RoverConfig) => c.id !== configId),
        activeConfig: s.activeConfig?.id === configId ? null : s.activeConfig,
      }));
    } catch (error) {
      setState((s: UseRoverConfigState) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Delete failed',
      }));
    }
  }, [buildHeaders]);

  return {
    ...state,
    fetchConfigs,
    createConfig,
    setActive,
    updateConfig,
    deleteConfig,
  };
}
