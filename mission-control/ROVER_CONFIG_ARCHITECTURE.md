# Rover Configuration Management Architecture

## Folder Structure

```
src/
├── core/
│   ├── domain/
│   │   ├── entities/
│   │   │   └── RoverConfig.ts              # Core rover config entity
│   │   └── repositories/
│   │       └── IRoverConfigRepository.ts   # Repository interface
│   │
│   └── application/
│       ├── dto/
│       │   ├── CreateRoverConfigDto.ts
│       │   ├── UpdateRoverConfigDto.ts
│       │   └── RoverConfigResponseDto.ts
│       │
│       └── services/
│           └── RoverConfigService.ts       # Business logic
│
├── infrastructure/
│   ├── persistence/
│   │   └── FirestoreRoverConfigRepository.ts
│   │
│   └── validation/
│       └── roverConfigValidation.ts        # Zod schemas
│
├── app/
│   ├── api/
│   │   └── operator/
│   │       └── rover-configs/
│   │           ├── route.ts                # GET, POST
│   │           ├── [configId]/
│   │           │   └── route.ts            # GET, PUT, DELETE
│   │           └── active/
│   │               └── route.ts            # GET, POST (select active)
│   │
│   └── operator/
│       └── config/
│           └── page.tsx                    # UI page
│
├── components/
│   └── rover-config/
│       ├── RoverConfigForm.tsx
│       ├── RoverConfigList.tsx
│       ├── RoverConfigCard.tsx
│       └── ActiveRoverSelector.tsx
│
└── hooks/
    └── useRoverConfig.ts                   # Client-side state management
```

---

## Firestore Schema

### Collection: `rover-configs`

```firestore
rover-configs/{configId}
{
  // Identifiers
  id: string                                // Firestore doc ID (nanoid)
  createdBy: string                         // Operator UID
  
  // Configuration
  name: string                              // Display name (e.g., "Rover Alpha-1")
  description: string                       // Optional: config purpose/notes
  roverTag: string                          // Physical rover identifier
  
  // Network Configuration
  ipAddress: string                         // IPv4 address
  port: number                              // Communication port (1-65535)
  
  // Metadata
  isActive: boolean                         // Selected active config
  isPinned: boolean                         // Favorite/pinned by operator
  
  // Timestamps
  createdAt: string                         // ISO 8601
  updatedAt: string                         // ISO 8601
  lastConnectedAt?: string                  // Last successful connection
}
```

### Compound Index (for queries)
- `createdBy` + `isActive` (for fetching operator's active config)
- `createdBy` + `updatedAt` (for sorting operator's configs)

---

## TypeScript Interfaces

### Domain Entity

```typescript
// src/core/domain/entities/RoverConfig.ts
export interface RoverConfig {
  id: string;
  createdBy: string;
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

export type RoverConfigCreateInput = Omit<
  RoverConfig,
  'id' | 'createdAt' | 'updatedAt' | 'lastConnectedAt'
>;

export type RoverConfigUpdateInput = Partial<
  Omit<RoverConfig, 'id' | 'createdBy' | 'createdAt'>
>;
```

### DTOs

```typescript
// src/core/application/dto/CreateRoverConfigDto.ts
export interface CreateRoverConfigDto {
  name: string;
  description?: string;
  roverTag: string;
  ipAddress: string;
  port: number;
}

// src/core/application/dto/UpdateRoverConfigDto.ts
export interface UpdateRoverConfigDto {
  roverName?: string;
  ipAddress?: string;
  port?: number;
  isActive?: boolean;
}

// src/core/application/dto/RoverConfigResponseDto.ts
export interface RoverConfigResponseDto {
  id: string;
  roverName: string;
  ipAddress: string;
  port: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

---

## API Route Structure

### `GET /api/operator/rover-configs`
Lists all configs for authenticated operator.

**Response:**
```json
{
  "success": true,
  "configs": [
    {
      "id": "cfg_abc123",
      "RoverName": "Rover Alpha-1",
      "ipAddress": "192.168.1.100",
      "port": 5000,
      "isActive": true,
      "createdAt": "2026-05-12T10:00:00Z",
      "updatedAt": "2026-05-12T10:00:00Z"
    }
  ]
}
```

### `POST /api/operator/rover-configs`
Create new rover config.

**Request:**
```json
{
  "name": "Rover Alpha-1",
  "description": "Primary exploration rover",
  "roverTag": "ALPHA-001",
  "ipAddress": "192.168.1.100",
  "port": 5000
}
```

**Response:** `201`
```json
{
  "success": true,
  "config": { ... }
}
```

### `GET /api/operator/rover-configs/[configId]`
Get single config by ID.

### `PUT /api/operator/rover-configs/[configId]`
Update config (partial or full).

**Request:**
```json
{
  "name": "Rover Alpha-1 Updated",
  "port": 5001
}
```

### `DELETE /api/operator/rover-configs/[configId]`
Delete config. Sets `isActive = false` on other configs if this was active.

**Response:** `204` No Content

### `GET /api/operator/rover-configs/active`
Get currently active config for operator.

**Response:**
```json
{
  "success": true,
  "config": { ... }
}
```

### `POST /api/operator/rover-configs/active`
Select active rover config.

**Request:**
```json
{
  "configId": "cfg_abc123"
}
```

---

## Validation Strategy

```typescript
// src/infrastructure/validation/roverConfigValidation.ts
import { z } from 'zod';

const ipAddressSchema = z
  .string()
  .ip({ version: 'v4' })
  .describe('Valid IPv4 address');

const portSchema = z
  .number()
  .int()
  .min(1)
  .max(65535)
  .describe('Valid port number');

export const createRoverConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  roverTag: z.string().min(1).max(50),
  ipAddress: ipAddressSchema,
  port: portSchema,
});

export const updateRoverConfigSchema = createRoverConfigSchema.partial();

export const setActiveConfigSchema = z.object({
  configId: z.string().min(1),
});
```

---

## Repository Interface

```typescript
// src/core/domain/repositories/IRoverConfigRepository.ts
import { RoverConfig, RoverConfigCreateInput, RoverConfigUpdateInput } from '../entities/RoverConfig';

export interface IRoverConfigRepository {
  // Create
  create(userId: string, config: RoverConfigCreateInput): Promise<RoverConfig>;

  // Read
  findById(id: string): Promise<RoverConfig | null>;
  findByIdAndUserId(id: string, userId: string): Promise<RoverConfig | null>;
  findAllByUserId(userId: string): Promise<RoverConfig[]>;
  findActiveByUserId(userId: string): Promise<RoverConfig | null>;

  // Update
  update(id: string, userId: string, updates: RoverConfigUpdateInput): Promise<RoverConfig | null>;
  setActive(configId: string, userId: string): Promise<RoverConfig | null>;

  // Delete
  delete(id: string, userId: string): Promise<boolean>;
}
```

---

## Service Layer

```typescript
// src/core/application/services/RoverConfigService.ts
export interface SetActiveResult {
  success: boolean;
  config?: RoverConfig;
  error?: string;
}

export class RoverConfigService {
  constructor(
    private readonly roverConfigRepository: IRoverConfigRepository
  ) {}

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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
```

---

## Firestore Implementation

```typescript
// src/infrastructure/persistence/FirestoreRoverConfigRepository.ts
import { Firestore } from 'firebase-admin/firestore';
import { nanoid } from 'nanoid';
import { IRoverConfigRepository } from '@/core/domain/repositories/IRoverConfigRepository';
import { RoverConfig, RoverConfigCreateInput, RoverConfigUpdateInput } from '@/core/domain/entities/RoverConfig';

const CONFIGS_COLLECTION = 'rover-configs';

export class FirestoreRoverConfigRepository implements IRoverConfigRepository {
  constructor(private readonly firestore: Firestore) {}

  async create(userId: string, config: RoverConfigCreateInput): Promise<RoverConfig> {
    const id = nanoid();
    const newConfig: RoverConfig = {
      ...config,
      id,
      createdBy: userId,
    };

    await this.firestore.collection(CONFIGS_COLLECTION).doc(id).set(this.toFirestoreDoc(newConfig));
    return newConfig;
  }

  async findById(id: string): Promise<RoverConfig | null> {
    const doc = await this.firestore.collection(CONFIGS_COLLECTION).doc(id).get();
    return doc.exists ? this.fromFirestoreDoc(id, doc.data()!) : null;
  }

  async findByIdAndUserId(id: string, userId: string): Promise<RoverConfig | null> {
    const config = await this.findById(id);
    return config?.createdBy === userId ? config : null;
  }

  async findAllByUserId(userId: string): Promise<RoverConfig[]> {
    const snapshot = await this.firestore
      .collection(CONFIGS_COLLECTION)
      .where('createdBy', '==', userId)
      .orderBy('updatedAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => this.fromFirestoreDoc(doc.id, doc.data()));
  }

  async findActiveByUserId(userId: string): Promise<RoverConfig | null> {
    const snapshot = await this.firestore
      .collection(CONFIGS_COLLECTION)
      .where('createdBy', '==', userId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    return snapshot.empty ? null : this.fromFirestoreDoc(snapshot.docs[0].id, snapshot.docs[0].data());
  }

  async update(id: string, userId: string, updates: RoverConfigUpdateInput): Promise<RoverConfig | null> {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) return null;

    await this.firestore
      .collection(CONFIGS_COLLECTION)
      .doc(id)
      .update(this.toFirestoreDoc(updates));

    return this.findById(id);
  }

  async setActive(configId: string, userId: string): Promise<RoverConfig | null> {
    const batch = this.firestore.batch();

    // Disable current active config
    const currentActive = await this.findActiveByUserId(userId);
    if (currentActive) {
      batch.update(
        this.firestore.collection(CONFIGS_COLLECTION).doc(currentActive.id),
        { isActive: false, updatedAt: new Date().toISOString() }
      );
    }

    // Enable new active config
    batch.update(
      this.firestore.collection(CONFIGS_COLLECTION).doc(configId),
      { isActive: true, updatedAt: new Date().toISOString() }
    );

    await batch.commit();
    return this.findById(configId);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) return false;

    await this.firestore.collection(CONFIGS_COLLECTION).doc(id).delete();

    // If deleted config was active, activate most recent
    if (existing.isActive) {
      const allConfigs = await this.findAllByUserId(userId);
      if (allConfigs.length > 0) {
        await this.setActive(allConfigs[0].id, userId);
      }
    }

    return true;
  }

  private toFirestoreDoc(config: Partial<RoverConfig>): Record<string, unknown> {
    const doc = { ...config };
    delete doc.id;
    return this.removeUndefinedValues(doc);
  }

  private fromFirestoreDoc(id: string, data: FirebaseFirestore.DocumentData): RoverConfig {
    return {
      id,
      createdBy: data.createdBy,
      name: data.name,
      description: data.description,
      roverTag: data.roverTag,
      ipAddress: data.ipAddress,
      port: data.port,
      isActive: data.isActive,
      isPinned: data.isPinned,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      lastConnectedAt: data.lastConnectedAt,
    };
  }

  private removeUndefinedValues(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.filter((item) => item !== undefined).map((item) => this.removeUndefinedValues(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, this.removeUndefinedValues(v)])
      );
    }

    return value;
  }
}
```

---

## State Management Hook

```typescript
// src/hooks/useRoverConfig.ts
import { useCallback, useState, useEffect } from 'react';
import { RoverConfig } from '@/core/domain/entities/RoverConfig';

interface UseRoverConfigState {
  configs: RoverConfig[];
  activeConfig: RoverConfig | null;
  loading: boolean;
  error: string | null;
}

export function useRoverConfig() {
  const [state, setState] = useState<UseRoverConfigState>({
    configs: [],
    activeConfig: null,
    loading: true,
    error: null,
  });

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/operator/rover-configs');
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
        setState((s) => ({ ...s, error: data.error, loading: false }));
      }
    } catch (error) {
      setState((s) => ({
        ...s,
        error: 'Failed to fetch configs',
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const createConfig = useCallback(
    async (config: CreateRoverConfigDto) => {
      try {
        const res = await fetch('/api/operator/rover-configs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });

        if (!res.ok) throw new Error('Failed to create');

        const data = await res.json();
        if (data.success) {
          setState((s) => ({
            ...s,
            configs: [data.config, ...s.configs],
          }));
          return data.config;
        }
      } catch (error) {
        setState((s) => ({
          ...s,
          error: error instanceof Error ? error.message : 'Create failed',
        }));
      }
    },
    []
  );

  const setActive = useCallback(async (configId: string) => {
    try {
      const res = await fetch('/api/operator/rover-configs/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId }),
      });

      if (!res.ok) throw new Error('Failed to set active');

      const data = await res.json();
      if (data.success) {
        setState((s) => ({
          ...s,
          activeConfig: data.config,
          configs: s.configs.map((c) => ({
            ...c,
            isActive: c.id === configId,
          })),
        }));
        return data.config;
      }
    } catch (error) {
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Set active failed',
      }));
    }
  }, []);

  return {
    ...state,
    fetchConfigs,
    createConfig,
    setActive,
  };
}
```

---

## Auth + API Route Example

```typescript
// src/app/api/operator/rover-configs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreRoverConfigRepository } from '@/infrastructure/persistence/FirestoreRoverConfigRepository';
import { RoverConfigService } from '@/core/application/services/RoverConfigService';
import { createRoverConfigSchema } from '@/infrastructure/validation/roverConfigValidation';
import { verifyOperatorAuth } from '@/infrastructure/auth/verify-operator';

export async function GET(request: NextRequest) {
  try {
    const userId = await verifyOperatorAuth(request);
    const firestore = getFirestoreInstance();
    const repository = new FirestoreRoverConfigRepository(firestore);
    const service = new RoverConfigService(repository);

    const configs = await service.getConfigs(userId);

    return NextResponse.json({ success: true, configs }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await verifyOperatorAuth(request);
    const body = await request.json();

    const validated = createRoverConfigSchema.parse(body);

    const firestore = getFirestoreInstance();
    const repository = new FirestoreRoverConfigRepository(firestore);
    const service = new RoverConfigService(repository);

    const result = await service.createConfig(userId, validated);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **User-scoped queries** | Each operator manages own configs. Prevents data leakage. |
| **Single active config** | Atomic `setActive()` with batch writes ensures consistency. |
| **Soft-delete cascade** | When active config deleted, next recent becomes active automatically. |
| **Zod validation** | Type-safe schema validation at API boundary. |
| **Repository pattern** | Decouples domain from Firestore. Testable, swappable storage. |
| **Compound indexes** | Fast queries for `createdBy + isActive` and recent updates. |
| **ISO timestamps** | Consistent date handling across Firestore and TypeScript. |

