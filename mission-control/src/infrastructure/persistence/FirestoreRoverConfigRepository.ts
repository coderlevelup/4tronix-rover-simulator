import { Firestore } from 'firebase-admin/firestore';
import { nanoid } from 'nanoid';
import { IRoverConfigRepository } from '@/core/domain/repositories/IRoverConfigRepository';
import { RoverConfig, RoverConfigCreateInput, RoverConfigUpdateInput } from '@/core/domain/entities/RoverConfig';

const CONFIGS_COLLECTION = 'rover-configs';

export class FirestoreRoverConfigRepository implements IRoverConfigRepository {
  constructor(private readonly firestore: Firestore) {}

  async create(userId: string, config: RoverConfigCreateInput): Promise<RoverConfig> {
    const id = nanoid();
    const now = new Date().toISOString();
    const newConfig: RoverConfig = {
      ...config,
      id,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    console.log('[FirestoreRoverConfigRepository] Creating config:', { id, userId, config });
    const docData = this.toFirestoreDoc(newConfig);
    console.log('[FirestoreRoverConfigRepository] Document data:', docData);

    await this.firestore.collection(CONFIGS_COLLECTION).doc(id).set(docData);
    console.log('[FirestoreRoverConfigRepository] Config created successfully in Firestore');

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
    console.log('[FirestoreRoverConfigRepository] Finding configs for user:', userId);

    const snapshot = await this.firestore
      .collection(CONFIGS_COLLECTION)
      .where('createdBy', '==', userId)
      .orderBy('updatedAt', 'desc')
      .get();

    console.log('[FirestoreRoverConfigRepository] Found documents:', snapshot.size);
    const configs = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      console.log('[FirestoreRoverConfigRepository] Document:', { id: doc.id, data });
      return this.fromFirestoreDoc(doc.id, data as Record<string, any>);
    });

    return configs;
  }

  async findActiveByUserId(userId: string): Promise<RoverConfig | null> {
    const snapshot = await this.firestore
      .collection(CONFIGS_COLLECTION)
      .where('createdBy', '==', userId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    return snapshot.empty ? null : this.fromFirestoreDoc(snapshot.docs[0].id, snapshot.docs[0].data() as Record<string, any>);
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

    const currentActive = await this.findActiveByUserId(userId);
    if (currentActive) {
      batch.update(
        this.firestore.collection(CONFIGS_COLLECTION).doc(currentActive.id),
        { isActive: false, updatedAt: new Date().toISOString() }
      );
    }

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

    if (existing.isActive) {
      const allConfigs = await this.findAllByUserId(userId);
      if (allConfigs.length > 0) {
        await this.setActive(allConfigs[0].id, userId);
      }
    }

    return true;
  }

  private toFirestoreDoc(config: Partial<RoverConfig>): Record<string, any> {
    const doc = { ...config };
    delete (doc as any).id;
    return this.removeUndefinedValues(doc) as Record<string, any>;
  }

  private fromFirestoreDoc(id: string, data: Record<string, any>): RoverConfig {
    return {
      id,
      createdBy: data.createdBy,
      name: data.name,
      description: data.description,
      roverTag: data.roverTag,

      // Rover type and connection
      roverType: data.roverType || 'physical', // Default to physical for backward compatibility
      ipAddress: data.ipAddress,
      port: data.port,

      // Visual feed configuration
      visualFeedType: data.visualFeedType || (data.roverType === 'simulator' ? 'simulator' : 'camera'),
      cameraWsPort: data.cameraWsPort,
      simulatorEndpoint: data.simulatorEndpoint,

      // Status flags
      isActive: data.isActive,
      isPinned: data.isPinned,

      // Timestamps
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
