/**
 * Firestore Challenge Repository Implementation
 *
 * Manages challenges and learner progress on challenges.
 * Collections:
 * - challenges/{challengeId} - Challenge definitions (can be seeded from src/data/challenges.ts)
 * - challenge_progress/{learnerId}/progress/{challengeId} - Learner's progress on each challenge
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  increment,
  serverTimestamp,
  getCountFromServer,
} from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { Challenge, ChallengeProgress } from '@/core/domain/entities/Challenge';
import { IChallengeRepository } from '@/core/domain/repositories/IChallengeRepository';

const CHALLENGES_COLLECTION = 'challenges';
const CHALLENGE_PROGRESS_COLLECTION = 'challenge_progress';

export class FirestoreChallengeRepository implements IChallengeRepository {
  private db: ReturnType<typeof getFirestoreClient>;

  constructor(db: ReturnType<typeof getFirestoreClient> = getFirestoreClient()) {
    this.db = db;
  }

  async getById(id: string): Promise<Challenge | null> {
    try {
      const challengeRef = doc(this.db, CHALLENGES_COLLECTION, id);
      const snap = await getDoc(challengeRef);

      if (!snap.exists()) {
        return null;
      }

      return this.fromFirestoreDoc(snap);
    } catch (error) {
      console.error('❌ Failed to get challenge:', error);
      throw new Error('Failed to retrieve challenge');
    }
  }

  async getAll(): Promise<Challenge[]> {
    try {
      const ref = collection(this.db, CHALLENGES_COLLECTION);
      const q = query(ref, orderBy('orderIndex', 'asc'));

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => this.fromFirestoreDoc(doc));
    } catch (error) {
      console.error('❌ Failed to get all challenges:', error);
      throw new Error('Failed to retrieve challenges');
    }
  }

  async getByDifficulty(difficulty: 'beginner' | 'intermediate' | 'advanced'): Promise<Challenge[]> {
    try {
      const ref = collection(this.db, CHALLENGES_COLLECTION);
      const q = query(
        ref,
        where('difficulty', '==', difficulty),
        orderBy('orderIndex', 'asc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => this.fromFirestoreDoc(doc));
    } catch (error) {
      console.error('❌ Failed to get challenges by difficulty:', error);
      throw new Error('Failed to retrieve challenges');
    }
  }

  async getByCategory(category: string): Promise<Challenge[]> {
    try {
      const ref = collection(this.db, CHALLENGES_COLLECTION);
      const q = query(
        ref,
        where('category', '==', category),
        orderBy('orderIndex', 'asc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => this.fromFirestoreDoc(doc));
    } catch (error) {
      console.error('❌ Failed to get challenges by category:', error);
      throw new Error('Failed to retrieve challenges');
    }
  }

  async getAvailableChallenges(learnerId: string): Promise<Challenge[]> {
    try {
      // Get learner data to check level and completed challenges
      // This would typically come from ILearnerRepository
      // For now, we'll just return all challenges and let the service layer filter
      return this.getAll();
    } catch (error) {
      console.error('❌ Failed to get available challenges:', error);
      throw new Error('Failed to retrieve available challenges');
    }
  }

  /**
   * ========== CHALLENGE PROGRESS TRACKING ==========
   */

  async getProgress(learnerId: string, challengeId: string): Promise<ChallengeProgress | null> {
    try {
      const progressRef = doc(
        this.db,
        CHALLENGE_PROGRESS_COLLECTION,
        learnerId,
        'progress',
        challengeId
      );

      const snap = await getDoc(progressRef);

      if (!snap.exists()) {
        return null;
      }

      return snap.data() as ChallengeProgress;
    } catch (error) {
      console.error('❌ Failed to get progress:', error);
      throw new Error('Failed to retrieve challenge progress');
    }
  }

  async getProgressForLearner(learnerId: string): Promise<ChallengeProgress[]> {
    try {
      const progressRef = collection(
        this.db,
        CHALLENGE_PROGRESS_COLLECTION,
        learnerId,
        'progress'
      );

      const snapshot = await getDocs(progressRef);
      return snapshot.docs.map((doc) => doc.data() as ChallengeProgress);
    } catch (error) {
      console.error('❌ Failed to get learner progress:', error);
      throw new Error('Failed to retrieve learner challenge progress');
    }
  }

  async saveProgress(progress: ChallengeProgress): Promise<void> {
    try {
      const progressRef = doc(
        this.db,
        CHALLENGE_PROGRESS_COLLECTION,
        progress.learnerId,
        'progress',
        progress.challengeId
      );

      await setDoc(progressRef, {
        ...progress,
        lastAttemptAt: serverTimestamp(),
      });

      console.log(
        `✅ Progress saved for ${progress.learnerId} on ${progress.challengeId}`
      );
    } catch (error) {
      console.error('❌ Failed to save progress:', error);
      throw new Error('Failed to save challenge progress');
    }
  }

  async markCompleted(
    learnerId: string,
    challengeId: string,
    xpAwarded: number,
    badgeAwarded: boolean
  ): Promise<void> {
    try {
      const progressRef = doc(
        this.db,
        CHALLENGE_PROGRESS_COLLECTION,
        learnerId,
        'progress',
        challengeId
      );

      await updateDoc(progressRef, {
        status: 'completed',
        xpAwarded,
        badgeAwarded,
        completedAt: serverTimestamp(),
        lastAttemptAt: serverTimestamp(),
      });

      console.log(`✅ Challenge marked completed: ${learnerId} → ${challengeId}`);
    } catch (error) {
      console.error('❌ Failed to mark challenge completed:', error);
      throw new Error('Failed to mark challenge as completed');
    }
  }

  async incrementAttempts(learnerId: string, challengeId: string): Promise<void> {
    try {
      const progressRef = doc(
        this.db,
        CHALLENGE_PROGRESS_COLLECTION,
        learnerId,
        'progress',
        challengeId
      );

      await updateDoc(progressRef, {
        attemptsCount: increment(1),
        lastAttemptAt: serverTimestamp(),
      });

      console.log(`✅ Attempt incremented: ${learnerId} on ${challengeId}`);
    } catch (error) {
      console.error('❌ Failed to increment attempts:', error);
      throw new Error('Failed to update attempts');
    }
  }

  async updateHintsRevealed(
    learnerId: string,
    challengeId: string,
    hintsRevealed: number
  ): Promise<void> {
    try {
      const progressRef = doc(
        this.db,
        CHALLENGE_PROGRESS_COLLECTION,
        learnerId,
        'progress',
        challengeId
      );

      await updateDoc(progressRef, {
        hintsRevealed,
        lastAttemptAt: serverTimestamp(),
      });

      console.log(
        `✅ Hints updated: ${learnerId} on ${challengeId} → ${hintsRevealed}`
      );
    } catch (error) {
      console.error('❌ Failed to update hints:', error);
      throw new Error('Failed to update hint usage');
    }
  }

  /**
   * ========== ANALYTICS ==========
   */

  async getCompletionStats(challengeId: string): Promise<{
    completions: number;
    attempts: number;
    completionRate: number;
  }> {
    try {
      // Query all progress records for this challenge across all learners
      // This is expensive for large datasets - consider caching in production
      const progressRef = collection(this.db, CHALLENGE_PROGRESS_COLLECTION);

      let completions = 0;
      let attempts = 0;

      // This would need a better implementation in production
      // For now, return placeholder stats
      return {
        completions,
        attempts,
        completionRate: 0,
      };
    } catch (error) {
      console.error('❌ Failed to get completion stats:', error);
      throw new Error('Failed to retrieve completion statistics');
    }
  }

  async getMostCompleted(maxResults: number = 10): Promise<Challenge[]> {
    try {
      // This would require tracking completion counts somewhere
      // For now, return challenges by orderIndex (most beginner challenges first)
      const ref = collection(this.db, CHALLENGES_COLLECTION);
      const q = query(ref, orderBy('orderIndex', 'asc'), limit(maxResults));

      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => this.fromFirestoreDoc(doc));
    } catch (error) {
      console.error('❌ Failed to get most completed:', error);
      throw new Error('Failed to retrieve most completed challenges');
    }
  }

  /**
   * ========== PRIVATE HELPERS ==========
   */

  private fromFirestoreDoc(doc: any): Challenge {
    const id = typeof doc === 'string' ? doc : doc.id;
    const data = typeof doc === 'string' ? undefined : doc.data?.();

    return {
      id,
      title: data?.title || '',
      description: data?.description || '',
      category: data?.category || '',
      difficulty: data?.difficulty || 'beginner',
      starterCode: data?.starterCode,
      expectedOutput: data?.expectedOutput || { shapes: [], tolerance: 10 },
      requiredLevel: data?.requiredLevel || 1,
      prerequisites: data?.prerequisites || [],
      xpReward: data?.xpReward || 10,
      points: data?.points || 10,
      badgeReward: data?.badgeReward,
      hints: data?.hints || [],
      orderIndex: data?.orderIndex || 999,
      createdAt: data?.createdAt?.toDate?.()?.toISOString(),
      updatedAt: data?.updatedAt?.toDate?.()?.toISOString(),
    };
  }
}