/**
 * Firestore Mission Repository Implementation
 *
 * Concrete implementation of IMissionRepository using Firestore.
 * Firestore acts as both persistent storage AND queue.
 *
 * Queue semantics (inspired by yard/rover/service.py):
 * - FIFO ordering by submittedAt timestamp
 * - Automatic queue position calculation
 * - Supports real-time updates via Firestore listeners (future)
 *
 * Performance considerations:
 * - Indexed queries on yardId + status for fast queue retrieval
 * - Batch operations for atomic updates
 */

import { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore as ClientFirestore,
} from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { Mission } from '@/core/domain/entities/Mission';
import { IMissionRepository } from '@/core/domain/repositories/IMissionRepository';

const MISSIONS_COLLECTION = 'missions';

type FirestoreLike = AdminFirestore | ClientFirestore;

// The admin and client Firestore SDKs have incompatible nominal types, so this
// repository reads snapshots through the minimal structural shapes it actually
// uses rather than `any`.
type MissionDocData = Record<string, unknown>;
type MissionDocSnapshot = { id: string; data: () => MissionDocData };
type QuerySnapshotLike = { docs: MissionDocSnapshot[] };
type DocSnapshotLike = { exists: () => boolean; data: () => MissionDocData | undefined };
type CountSnapshotLike = { data: () => { count: number } };

export class FirestoreMissionRepository implements IMissionRepository {
  constructor(private readonly firestore: FirestoreLike) {}

  async create(mission: Omit<Mission, 'id' | 'queuePosition' | 'estimatedWait' | 'submittedAt'>): Promise<Mission> {
    const id = nanoid();
    const submittedAt = (mission as { submittedAt?: string }).submittedAt || new Date().toISOString();

    const newMission: Mission = {
      ...mission,
      id,
      submittedAt,
    };

    await this.writeMission(id, newMission);

    const queuePosition = await this.calculateQueuePosition(newMission.yardId, newMission.submittedAt);
    const estimatedWait = this.calculateEstimatedWait(queuePosition);

    return {
      ...newMission,
      queuePosition,
      estimatedWait,
    };
  }

  async findById(id: string): Promise<Mission | null> {
    const snapshot = await this.getMissionDoc(id);

    if (!snapshot.exists()) {
      return null;
    }

    const mission = this.fromFirestoreDoc(id, snapshot.data()!);

    if (mission.status === 'queued') {
      const queuePosition = await this.calculateQueuePosition(mission.yardId, mission.submittedAt);
      const estimatedWait = this.calculateEstimatedWait(queuePosition);
      return { ...mission, queuePosition, estimatedWait };
    }

    return mission;
  }

  async findByLearnerId(learnerId: string): Promise<Mission[]> {
    const snapshot = await this.getLearnerMissionsSnapshot(learnerId);

    return snapshot.docs.map((missionDoc) => this.fromFirestoreDoc(missionDoc.id, missionDoc.data()));
  }

  async findBySessionId(_sessionId: string): Promise<Mission[]> {
    // Session-based history removed; keep method for compatibility but return empty.
    return [];
  }

  async getQueuedMissions(yardId: string): Promise<Mission[]> {
    const snapshot = await this.getQueuedMissionsSnapshot(yardId);

    const missions: Mission[] = snapshot.docs.map((missionDoc) => this.fromFirestoreDoc(missionDoc.id, missionDoc.data()));

    return missions.map((mission, index) => ({
      ...mission,
      queuePosition: index + 1,
      estimatedWait: this.calculateEstimatedWait(index + 1),
    }));
  }

  async update(id: string, updates: Partial<Mission>): Promise<Mission | null> {
    const snapshot = await this.getMissionDoc(id);

    if (!snapshot.exists()) {
      return null;
    }

    await this.updateMission(id, updates);
    return this.findById(id);
  }

  async getQueueLength(yardId: string): Promise<number> {
    const snapshot = await this.getQueueLengthSnapshot(yardId);

    return this.getCountValue(snapshot);
  }

  async findAll(): Promise<Mission[]> {
    const snapshot = await this.getAllMissionsSnapshot();

    const missions: Mission[] = snapshot.docs.map((missionDoc) => this.fromFirestoreDoc(missionDoc.id, missionDoc.data()));

    return Promise.all(
      missions.map(async (mission) => {
        if (mission.status === 'queued') {
          const queuePosition = await this.calculateQueuePosition(mission.yardId, mission.submittedAt);
          const estimatedWait = this.calculateEstimatedWait(queuePosition);
          return { ...mission, queuePosition, estimatedWait };
        }

        return mission;
      })
    );
  }

  /**
   * Calculate queue position for a mission
   * Position = number of queued missions submitted before this one + 1
   */
  private async calculateQueuePosition(yardId: string, submittedAt: string): Promise<number> {
    const snapshot = await this.getQueuePositionSnapshot(yardId, submittedAt);

    return this.getCountValue(snapshot) + 1;
  }

  /**
   * Estimate wait time based on queue position
   * Assumes average execution time of 90 seconds per mission (configurable)
   */
  private calculateEstimatedWait(queuePosition: number): number {
    const AVERAGE_EXECUTION_TIME_SECONDS = 90;
    return (queuePosition - 1) * AVERAGE_EXECUTION_TIME_SECONDS;
  }

  /**
   * Convert Mission entity to Firestore document
   * Removes computed fields that shouldn't be persisted
   */
  private toFirestoreDoc(mission: Partial<Mission>): Record<string, unknown> {
    const persistedFields = { ...mission };

    if (typeof persistedFields.code === 'string') {
      persistedFields.code = this.normalizeMissionCode(persistedFields.code);
    }

    delete persistedFields.queuePosition;
    delete persistedFields.estimatedWait;
    return this.removeUndefinedValues(persistedFields) as Record<string, unknown>;
  }

  private normalizeMissionCode(code: string): string {
    return code
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trimEnd())
      .filter((line) => line.trim().length > 0)
      .join('\n');
  }

  private isAdminFirestore(): boolean {
    return typeof (this.firestore as AdminFirestore).collection === 'function';
  }

  // Strongly-typed accessors. Branching on isAdminFirestore() alone leaves the
  // compiler with the admin|client union (whose CollectionReference shapes
  // differ), so each SDK is accessed through its own typed handle instead.
  private adminDb(): AdminFirestore {
    return this.firestore as AdminFirestore;
  }

  private clientDb(): ClientFirestore {
    return this.firestore as ClientFirestore;
  }

  private async getMissionDoc(id: string): Promise<DocSnapshotLike> {
    if (this.isAdminFirestore()) {
      return (await this.adminDb().collection(MISSIONS_COLLECTION).doc(id).get()) as unknown as DocSnapshotLike;
    }

    return (await getDoc(doc(this.clientDb(), MISSIONS_COLLECTION, id))) as unknown as DocSnapshotLike;
  }

  private async writeMission(id: string, mission: Partial<Mission>): Promise<void> {
    const payload = this.toFirestoreDoc(mission);

    if (this.isAdminFirestore()) {
      await this.adminDb().collection(MISSIONS_COLLECTION).doc(id).set(payload);
      return;
    }

    await setDoc(doc(this.clientDb(), MISSIONS_COLLECTION, id), payload);
  }

  private async updateMission(id: string, updates: Partial<Mission>): Promise<void> {
    const payload = this.toFirestoreDoc(updates);

    if (this.isAdminFirestore()) {
      await this.adminDb().collection(MISSIONS_COLLECTION).doc(id).update(payload);
      return;
    }

    await updateDoc(doc(this.clientDb(), MISSIONS_COLLECTION, id), payload);
  }

  private async getLearnerMissionsSnapshot(learnerId: string): Promise<QuerySnapshotLike> {
    if (this.isAdminFirestore()) {
      return this.adminDb()
        .collection(MISSIONS_COLLECTION)
        .where('learnerId', '==', learnerId)
        .orderBy('submittedAt', 'desc')
        .get() as unknown as QuerySnapshotLike;
    }

    const missionsQuery = query(
      collection(this.clientDb(), MISSIONS_COLLECTION),
      where('learnerId', '==', learnerId),
      orderBy('submittedAt', 'desc')
    );

    return (await getDocs(missionsQuery)) as unknown as QuerySnapshotLike;
  }

  private async getQueuedMissionsSnapshot(yardId: string): Promise<QuerySnapshotLike> {
    if (this.isAdminFirestore()) {
      return this.adminDb()
        .collection(MISSIONS_COLLECTION)
        .where('yardId', '==', yardId)
        .where('status', '==', 'queued')
        .orderBy('submittedAt', 'asc')
        .get() as unknown as QuerySnapshotLike;
    }

    const missionsQuery = query(
      collection(this.clientDb(), MISSIONS_COLLECTION),
      where('yardId', '==', yardId),
      where('status', '==', 'queued'),
      orderBy('submittedAt', 'asc')
    );

    return (await getDocs(missionsQuery)) as unknown as QuerySnapshotLike;
  }

  private async getAllMissionsSnapshot(): Promise<QuerySnapshotLike> {
    if (this.isAdminFirestore()) {
      return this.adminDb().collection(MISSIONS_COLLECTION).orderBy('submittedAt', 'asc').limit(100).get() as unknown as QuerySnapshotLike;
    }

    const missionsQuery = query(collection(this.clientDb(), MISSIONS_COLLECTION), orderBy('submittedAt', 'asc'), limit(100));

    return (await getDocs(missionsQuery)) as unknown as QuerySnapshotLike;
  }

  private async getQueueLengthSnapshot(yardId: string): Promise<CountSnapshotLike> {
    if (this.isAdminFirestore()) {
      return this.adminDb()
        .collection(MISSIONS_COLLECTION)
        .where('yardId', '==', yardId)
        .where('status', '==', 'queued')
        .count()
        .get() as unknown as CountSnapshotLike;
    }

    const missionsQuery = query(
      collection(this.clientDb(), MISSIONS_COLLECTION),
      where('yardId', '==', yardId),
      where('status', '==', 'queued')
    );

    return (await getCountFromServer(missionsQuery)) as unknown as CountSnapshotLike;
  }

  private async getQueuePositionSnapshot(yardId: string, submittedAt: string): Promise<CountSnapshotLike> {
    if (this.isAdminFirestore()) {
      return this.adminDb()
        .collection(MISSIONS_COLLECTION)
        .where('yardId', '==', yardId)
        .where('status', '==', 'queued')
        .where('submittedAt', '<', submittedAt)
        .count()
        .get() as unknown as CountSnapshotLike;
    }

    const missionsQuery = query(
      collection(this.clientDb(), MISSIONS_COLLECTION),
      where('yardId', '==', yardId),
      where('status', '==', 'queued'),
      where('submittedAt', '<', submittedAt)
    );

    return (await getCountFromServer(missionsQuery)) as unknown as CountSnapshotLike;
  }

  private getCountValue(snapshot: CountSnapshotLike): number {
    return snapshot.data().count;
  }

  /**
   * Firestore Admin rejects undefined values, including nested optional fields.
   */
  private removeUndefinedValues(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value
        .filter((item) => item !== undefined)
        .map((item) => this.removeUndefinedValues(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, nestedValue]) => nestedValue !== undefined)
          .map(([key, nestedValue]) => [key, this.removeUndefinedValues(nestedValue)])
      );
    }

    return value;
  }

  /**
   * Convert Firestore document to Mission entity
   */
  private fromFirestoreDoc(id: string, data: MissionDocData): Mission {
    return {
      id,
      yardId: data.yardId as string,
      learnerId: (data.learnerId as string) || (data.sessionId as string),
      sessionId: data.sessionId as string,
      learnerUid: data.learnerUid as string | undefined,
      name: data.name as string | undefined,
      code: data.code as string,
      blocklyState: data.blocklyState as string | undefined,
      status: data.status as Mission['status'],
      executionResult: data.executionResult as Mission['executionResult'],
      executionMetadata: data.executionMetadata as Mission['executionMetadata'],
      videoUrl: data.videoUrl as string | undefined,
      youtubeUrl: data.youtubeUrl as string | undefined,
      submittedAt: data.submittedAt as string,
      startedAt: data.startedAt as string | undefined,
      completedAt: data.completedAt as string | undefined,
    };
  }
}
