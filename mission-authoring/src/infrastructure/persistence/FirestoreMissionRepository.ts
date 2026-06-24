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

export class FirestoreMissionRepository implements IMissionRepository {
  constructor(private readonly firestore: FirestoreLike) {}

  async create(mission: Omit<Mission, 'id' | 'queuePosition' | 'estimatedWait' | 'submittedAt'>): Promise<Mission> {
    const id = nanoid();
    const submittedAt = (mission as any).submittedAt || new Date().toISOString();

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

    return snapshot.docs.map((missionDoc: any) => this.fromFirestoreDoc(missionDoc.id, missionDoc.data()));
  }

  async findBySessionId(sessionId: string): Promise<Mission[]> {
    // Session-based history removed; keep method for compatibility but return empty.
    return [];
  }

  async getQueuedMissions(yardId: string): Promise<Mission[]> {
    const snapshot = await this.getQueuedMissionsSnapshot(yardId);

    const missions: Mission[] = snapshot.docs.map((missionDoc: any) => this.fromFirestoreDoc(missionDoc.id, missionDoc.data()));

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

    const missions: Mission[] = snapshot.docs.map((missionDoc: any) => this.fromFirestoreDoc(missionDoc.id, missionDoc.data()));

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

  private async getMissionDoc(id: string): Promise<any> {
    if (this.isAdminFirestore()) {
      return this.adminDb().collection(MISSIONS_COLLECTION).doc(id).get();
    }

    return getDoc(doc(this.clientDb(), MISSIONS_COLLECTION, id));
  }

  private async writeMission(id: string, mission: Partial<Mission>): Promise<void> {
    const payload = this.toFirestoreDoc(mission);

    if (this.isAdminFirestore()) {
      await this.adminDb().collection(MISSIONS_COLLECTION).doc(id).set(payload);
      return;
    }

    await setDoc(doc(this.clientDb(), MISSIONS_COLLECTION, id), payload as Record<string, any>);
  }

  private async updateMission(id: string, updates: Partial<Mission>): Promise<void> {
    const payload = this.toFirestoreDoc(updates);

    if (this.isAdminFirestore()) {
      await this.adminDb().collection(MISSIONS_COLLECTION).doc(id).update(payload);
      return;
    }

    await updateDoc(doc(this.clientDb(), MISSIONS_COLLECTION, id), payload as Record<string, any>);
  }

  private async getLearnerMissionsSnapshot(learnerId: string): Promise<any> {
    if (this.isAdminFirestore()) {
      return this.adminDb()
        .collection(MISSIONS_COLLECTION)
        .where('learnerId', '==', learnerId)
        .orderBy('submittedAt', 'desc')
        .get();
    }

    const missionsQuery = query(
      collection(this.clientDb(), MISSIONS_COLLECTION),
      where('learnerId', '==', learnerId),
      orderBy('submittedAt', 'desc')
    );

    return getDocs(missionsQuery);
  }

  private async getQueuedMissionsSnapshot(yardId: string): Promise<any> {
    if (this.isAdminFirestore()) {
      return this.adminDb()
        .collection(MISSIONS_COLLECTION)
        .where('yardId', '==', yardId)
        .where('status', '==', 'queued')
        .orderBy('submittedAt', 'asc')
        .get();
    }

    const missionsQuery = query(
      collection(this.clientDb(), MISSIONS_COLLECTION),
      where('yardId', '==', yardId),
      where('status', '==', 'queued'),
      orderBy('submittedAt', 'asc')
    );

    return getDocs(missionsQuery);
  }

  private async getAllMissionsSnapshot(): Promise<any> {
    if (this.isAdminFirestore()) {
      return this.adminDb().collection(MISSIONS_COLLECTION).orderBy('submittedAt', 'asc').limit(100).get();
    }

    const missionsQuery = query(collection(this.clientDb(), MISSIONS_COLLECTION), orderBy('submittedAt', 'asc'), limit(100));

    return getDocs(missionsQuery);
  }

  private async getQueueLengthSnapshot(yardId: string): Promise<any> {
    if (this.isAdminFirestore()) {
      return this.adminDb()
        .collection(MISSIONS_COLLECTION)
        .where('yardId', '==', yardId)
        .where('status', '==', 'queued')
        .count()
        .get();
    }

    const missionsQuery = query(
      collection(this.clientDb(), MISSIONS_COLLECTION),
      where('yardId', '==', yardId),
      where('status', '==', 'queued')
    );

    return getCountFromServer(missionsQuery);
  }

  private async getQueuePositionSnapshot(yardId: string, submittedAt: string): Promise<any> {
    if (this.isAdminFirestore()) {
      return this.adminDb()
        .collection(MISSIONS_COLLECTION)
        .where('yardId', '==', yardId)
        .where('status', '==', 'queued')
        .where('submittedAt', '<', submittedAt)
        .count()
        .get();
    }

    const missionsQuery = query(
      collection(this.clientDb(), MISSIONS_COLLECTION),
      where('yardId', '==', yardId),
      where('status', '==', 'queued'),
      where('submittedAt', '<', submittedAt)
    );

    return getCountFromServer(missionsQuery);
  }

  private getCountValue(snapshot: { data: () => { count: number } }): number {
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
  private fromFirestoreDoc(id: string, data: FirebaseFirestore.DocumentData): Mission {
    return {
      id,
      yardId: data.yardId,
      learnerId: data.learnerId || data.sessionId,
      sessionId: data.sessionId,
      learnerUid: data.learnerUid,
      name: data.name,
      code: data.code,
      status: data.status,
      executionResult: data.executionResult,
      executionMetadata: data.executionMetadata,
      videoUrl: data.videoUrl,
      youtubeUrl: data.youtubeUrl,
      submittedAt: data.submittedAt,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
    };
  }
}
