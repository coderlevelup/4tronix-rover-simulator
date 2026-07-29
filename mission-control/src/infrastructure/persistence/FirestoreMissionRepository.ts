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
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  setDoc,
  updateDoc,
  type Firestore as ClientFirestore,
} from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { Mission } from '@/core/domain/entities/Mission';
import {
  IMissionRepository,
  MissionCursor,
  MissionPage,
} from '@/core/domain/repositories/IMissionRepository';

const MISSIONS_COLLECTION = 'missions';

type FirestoreLike = AdminFirestore | ClientFirestore;

// The admin and client Firestore SDKs have incompatible nominal types, so this
// repository reads snapshots through the minimal structural shapes it actually
// uses rather than `any`.
type MissionDocData = Record<string, unknown>;
type MissionDocSnapshot = { id: string; data: () => MissionDocData };
type QuerySnapshotLike = { docs: MissionDocSnapshot[] };
type DocSnapshotLike = { exists: boolean; data: () => MissionDocData | undefined };

export class FirestoreMissionRepository implements IMissionRepository {
  constructor(private readonly firestore: FirestoreLike) {}

  async create(mission: Omit<Mission, 'id' | 'submittedAt'>): Promise<Mission> {
    const id = nanoid();
    const submittedAt = (mission as { submittedAt?: string }).submittedAt || new Date().toISOString();

    const newMission: Mission = {
      ...mission,
      id,
      submittedAt,
    };

    await this.writeMission(id, newMission);

    // No queue-position aggregation here. It cost an extra COUNT query on
    // every single submission, and nothing renders the result - see the note
    // on calculateEstimatedWait. getQueuedMissions derives position from the
    // ordered result for free when it is genuinely needed.
    return newMission;
  }

  async findById(id: string): Promise<Mission | null> {
    const snapshot = await this.getMissionDoc(id);

    if (!snapshot.exists) {
      return null;
    }

    const mission = this.fromFirestoreDoc(id, snapshot.data()!);

    // A deleted mission reads as absent, so a shared link 404s rather than
    // showing work an operator removed.
    return mission.deleted ? null : mission;
  }

  async update(id: string, updates: Partial<Mission>): Promise<Mission | null> {
    const snapshot = await this.getMissionDoc(id);

    if (!snapshot.exists) {
      return null;
    }

    await this.updateMission(id, updates);
    return this.findById(id);
  }

  /**
   * Recent missions for the public feed. Reads exactly `limit` documents and
   * nothing else.
   *
   * findAll() is the wrong tool for the feed and was costing roughly 125 reads
   * per page view: it fetches 100 documents to render 24, then runs a COUNT
   * aggregation per queued mission to work out queue positions the feed never
   * displays. With 25 queued missions that is 25 extra round trips, which is
   * also why the page sat on a spinner for ~30 seconds.
   *
   * Queue position is genuinely needed on the history page, where a learner is
   * waiting on their own mission. It is not needed here, so it is not paid for.
   */
  async findRecent(limit: number, cursor?: MissionCursor): Promise<MissionPage> {
    // Fetch one extra to learn whether another page exists, without paying for
    // a separate count query.
    const snapshot = await this.getRecentMissionsSnapshot(limit + 1, cursor);
    const docs = snapshot.docs;

    const hasMore = docs.length > limit;
    const page = hasMore ? docs.slice(0, limit) : docs;
    const missions = page
      .map((missionDoc) => this.fromFirestoreDoc(missionDoc.id, missionDoc.data()))
      // Filtered here rather than in the query: `where('deleted','==',false)`
      // would need a composite index AND a backfill, since missions written
      // before soft delete existed have no such field. Deletions are rare, so
      // a page occasionally rendering fewer than FEED_SIZE cards is a better
      // trade than an index migration.
      .filter((mission) => !mission.deleted);

    const last = missions[missions.length - 1];

    return {
      missions,
      // Firestore pages by cursor, not offset - an offset would still read and
      // bill every skipped document. Both ordering fields are included so a
      // shared submittedAt cannot make a page skip or repeat a mission.
      nextCursor: hasMore && last ? { submittedAt: last.submittedAt, id: last.id } : null,
    };
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

    // Mission documents are world-readable. A plaintext learner address must
    // never reach one - only learnerEmailHash. The Mission type no longer has
    // the field, so this is a backstop against an untyped or legacy caller
    // (e.g. a partial update assembled from raw Firestore data) reintroducing
    // it silently.
    delete (persistedFields as Record<string, unknown>).learnerEmail;

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
      const snapshot = await this.adminDb().collection(MISSIONS_COLLECTION).doc(id).get();
      return { exists: snapshot.exists, data: () => snapshot.data() as MissionDocData | undefined };
    }

    const snapshot = await getDoc(doc(this.clientDb(), MISSIONS_COLLECTION, id));
    return { exists: snapshot.exists(), data: () => snapshot.data() as MissionDocData | undefined };
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

  private async getRecentMissionsSnapshot(
    max: number,
    cursor?: MissionCursor
  ): Promise<QuerySnapshotLike> {
    if (this.isAdminFirestore()) {
      let adminQuery = this.adminDb()
        .collection(MISSIONS_COLLECTION)
        .orderBy('submittedAt', 'desc')
        .orderBy('__name__', 'desc');

      if (cursor) {
        adminQuery = adminQuery.startAfter(cursor.submittedAt, cursor.id);
      }

      return adminQuery.limit(max).get() as unknown as QuerySnapshotLike;
    }

    const constraints = [
      orderBy('submittedAt', 'desc'),
      orderBy('__name__', 'desc'),
      ...(cursor ? [startAfter(cursor.submittedAt, cursor.id)] : []),
      limit(max),
    ];

    const missionsQuery = query(collection(this.clientDb(), MISSIONS_COLLECTION), ...constraints);

    return (await getDocs(missionsQuery)) as unknown as QuerySnapshotLike;
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
      learnerEmailHash: data.learnerEmailHash as string | undefined,
      learnerUid: data.learnerUid as string | undefined,
      name: data.name as string | undefined,
      code: data.code as string,
      blocklyState: data.blocklyState as string | undefined,
      status: data.status as Mission['status'],
      deleted: (data.deleted as boolean) ?? false,
      deletedAt: data.deletedAt as string | undefined,
      executionResult: data.executionResult as Mission['executionResult'],
      executionMetadata: data.executionMetadata as Mission['executionMetadata'],
      videoUrl: data.videoUrl as string | undefined,
      youtubeUrl: data.youtubeUrl as string | undefined,
      submittedAt: data.submittedAt as string,
      startedAt: data.startedAt as string | undefined,
      completedAt: data.completedAt as string | undefined,

       // Locking
      lockOwner: (data.lockOwner as string | null) ?? null,
      lockedAt: (data.lockedAt as string | null) ?? null,
      leaseExpiresAt: (data.leaseExpiresAt as string | null) ?? null,

      // Review
      needsReview: (data.needsReview as boolean) ?? false,
      reviewReason: (data.reviewReason as string | null) ?? null,

      // Conflict resolution — fall back to submittedAt for legacy docs
      statusUpdatedAt: (data.statusUpdatedAt as string) ?? (data.submittedAt as string),
      };
  }
}
