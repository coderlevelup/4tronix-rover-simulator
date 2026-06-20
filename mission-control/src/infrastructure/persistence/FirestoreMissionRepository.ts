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

import { Firestore } from 'firebase-admin/firestore';
import { nanoid } from 'nanoid';
import { Mission } from '@/core/domain/entities/Mission';
import { IMissionRepository } from '@/core/domain/repositories/IMissionRepository';

const MISSIONS_COLLECTION = 'missions';

export class FirestoreMissionRepository implements IMissionRepository {
  constructor(private readonly firestore: Firestore) {}

  async create(mission: Omit<Mission, 'id' | 'queuePosition' | 'estimatedWait'>): Promise<Mission> {
    const id = nanoid();
    const newMission: Mission = {
      ...mission,
      id,
      submittedAt: new Date().toISOString(),
    };

    await this.firestore.collection(MISSIONS_COLLECTION).doc(id).set(this.toFirestoreDoc(newMission));

    const queuePosition = await this.calculateQueuePosition(newMission.yardId, newMission.submittedAt);
    const estimatedWait = this.calculateEstimatedWait(queuePosition);

    return {
      ...newMission,
      queuePosition,
      estimatedWait,
    };
  }

  async findById(id: string): Promise<Mission | null> {
    const doc = await this.firestore.collection(MISSIONS_COLLECTION).doc(id).get();

    if (!doc.exists) {
      return null;
    }

    const mission = this.fromFirestoreDoc(id, doc.data()!);

    if (mission.status === 'queued') {
      const queuePosition = await this.calculateQueuePosition(mission.yardId, mission.submittedAt);
      const estimatedWait = this.calculateEstimatedWait(queuePosition);
      return { ...mission, queuePosition, estimatedWait };
    }

    return mission;
  }

  async findBySessionId(sessionId: string): Promise<Mission[]> {
    // Session-based history removed; keep method for compatibility but return empty.
    return [];
  }

  async getQueuedMissions(yardId: string): Promise<Mission[]> {
    const snapshot = await this.firestore
      .collection(MISSIONS_COLLECTION)
      .where('yardId', '==', yardId)
      .where('status', '==', 'queued')
      .orderBy('submittedAt', 'asc')
      .get();

    const missions = snapshot.docs.map((doc: any) => this.fromFirestoreDoc(doc.id, doc.data()));

    return missions.map((mission, index) => ({
      ...mission,
      queuePosition: index + 1,
      estimatedWait: this.calculateEstimatedWait(index + 1),
    }));
  }

  async update(id: string, updates: Partial<Mission>): Promise<Mission | null> {
    const docRef = this.firestore.collection(MISSIONS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    await docRef.update(this.toFirestoreDoc(updates));
    return this.findById(id);
  }

  async getQueueLength(yardId: string): Promise<number> {
    const snapshot = await this.firestore
      .collection(MISSIONS_COLLECTION)
      .where('yardId', '==', yardId)
      .where('status', '==', 'queued')
      .count()
      .get();

    return snapshot.data().count;
  }

  async findAll(): Promise<Mission[]> {
    const snapshot = await this.firestore
      .collection(MISSIONS_COLLECTION)
      .orderBy('submittedAt', 'asc')
      .limit(100)
      .get();

    const missions = snapshot.docs.map((doc: any) => this.fromFirestoreDoc(doc.id, doc.data()));

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
    const snapshot = await this.firestore
      .collection(MISSIONS_COLLECTION)
      .where('yardId', '==', yardId)
      .where('status', '==', 'queued')
      .where('submittedAt', '<', submittedAt)
      .count()
      .get();

    return snapshot.data().count + 1;
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
    delete persistedFields.queuePosition;
    delete persistedFields.estimatedWait;
    return this.removeUndefinedValues(persistedFields) as Record<string, unknown>;
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
      learnerId: data.learnerId,          // Set by mission-authoring on submit
      learnerEmail: data.learnerEmail,    // Optional email identity (Epic 2)
      sessionId: data.sessionId,
      name: data.name,                    // Mission name
      code: data.code,
      challengeId: data.challengeId,
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
