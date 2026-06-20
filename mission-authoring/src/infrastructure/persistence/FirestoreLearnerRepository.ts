/**
 * Extended Firestore Learner Repository Implementation
 *
 * Manages anonymous learner data in Firestore including gamification.
 * Collection: learners/{sessionId}
 *
 * Changes:
 * - Added XP/level management (addXP, updateLevel)
 * - Added badge management (addBadge, getBadges)
 * - Added challenge management (unlockChallenge, completeChallenge, recordHintUsage)
 * - Added leaderboard queries
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  getCountFromServer,
} from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { Learner, calculateLevelFromXP } from '@/core/domain/entities/Learner';
import { ILearnerRepository } from '@/core/domain/repositories/ILearnerRepository';

const COLLECTION_NAME = 'learners';

export class FirestoreLearnerRepository implements ILearnerRepository {
  private db: ReturnType<typeof getFirestoreClient>;

  constructor(db: ReturnType<typeof getFirestoreClient> = getFirestoreClient()) {
    this.db = db;
  }

  async create(learner: Learner): Promise<void> {
    try {
      const learnerRef = doc(this.db, COLLECTION_NAME, learner.sessionId);

      await setDoc(learnerRef, {
        ...learner,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      });

      console.log('✅ Learner created:', learner.sessionId);
    } catch (error) {
      console.error('❌ Failed to create learner:', error);
      throw new Error('Failed to create learner profile');
    }
  }

  async findBySessionId(sessionId: string): Promise<Learner | null> {
    try {
      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);
      const learnerSnap = await getDoc(learnerRef);

      if (!learnerSnap.exists()) {
        return null;
      }

      const data = learnerSnap.data();
      return {
        ...data,
        id: learnerSnap.id,
        // Convert Firestore timestamps to ISO strings
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        lastActiveAt: data.lastActiveAt?.toDate?.()?.toISOString() || data.lastActiveAt,
        devices: data.devices?.map((device: any) => ({
          ...device,
          firstSeenAt: device.firstSeenAt?.toDate?.()?.toISOString() || device.firstSeenAt,
          lastSeenAt: device.lastSeenAt?.toDate?.()?.toISOString() || device.lastSeenAt,
        })) || [],
        // Ensure gamification fields exist
        xp: data.xp ?? 0,
        level: data.level ?? 1,
        challenges_completed: data.challenges_completed ?? [],
        challenges_unlocked: data.challenges_unlocked ?? [],
        badges: data.badges ?? [],
        hints_used: data.hints_used ?? {},
      } as Learner;
    } catch (error) {
      console.error('❌ Failed to find learner:', error);
      throw new Error('Failed to retrieve learner profile');
    }
  }

  async update(sessionId: string, updates: Partial<Learner>): Promise<void> {
    try {
      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);

      await updateDoc(learnerRef, {
        ...updates,
        lastActiveAt: serverTimestamp(),
      });

      console.log('✅ Learner updated:', sessionId);
    } catch (error) {
      console.error('❌ Failed to update learner:', error);
      throw new Error('Failed to update learner profile');
    }
  }

  async incrementMissionCount(sessionId: string): Promise<void> {
    try {
      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);

      await updateDoc(learnerRef, {
        missionCount: increment(1),
        lastActiveAt: serverTimestamp(),
      });

      console.log('✅ Mission count incremented:', sessionId);
    } catch (error) {
      console.error('❌ Failed to increment mission count:', error);
      throw new Error('Failed to update mission count');
    }
  }

  async incrementCompletedMissions(sessionId: string): Promise<void> {
    try {
      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);

      await updateDoc(learnerRef, {
        completedMissions: increment(1),
        lastActiveAt: serverTimestamp(),
      });

      console.log('✅ Completed missions incremented:', sessionId);
    } catch (error) {
      console.error('❌ Failed to increment completed missions:', error);
      throw new Error('Failed to update completed missions');
    }
  }

  async updateLastActive(sessionId: string): Promise<void> {
    try {
      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);

      await updateDoc(learnerRef, {
        lastActiveAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('❌ Failed to update last active:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  async getStatistics(sessionId: string): Promise<{
    totalMissions: number;
    completedMissions: number;
    successRate: number;
  }> {
    try {
      const learner = await this.findBySessionId(sessionId);

      if (!learner) {
        return {
          totalMissions: 0,
          completedMissions: 0,
          successRate: 0,
        };
      }

      const successRate =
        learner.missionCount > 0
          ? (learner.completedMissions / learner.missionCount) * 100
          : 0;

      return {
        totalMissions: learner.missionCount,
        completedMissions: learner.completedMissions,
        successRate: Math.round(successRate),
      };
    } catch (error) {
      console.error('❌ Failed to get statistics:', error);
      throw new Error('Failed to retrieve learner statistics');
    }
  }

  /**
   * ========== GAMIFICATION METHODS ==========
   */

  async addXP(sessionId: string, amount: number): Promise<{ xp: number; level: number; leveledUp: boolean }> {
    try {
      const learner = await this.findBySessionId(sessionId);
      if (!learner) {
        throw new Error('Learner not found');
      }

      const oldLevel = learner.level;
      const newXP = learner.xp + amount;
      const newLevel = calculateLevelFromXP(newXP);

      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);

      await updateDoc(learnerRef, {
        xp: newXP,
        level: newLevel,
        lastActiveAt: serverTimestamp(),
      });

      console.log(`✅ XP added to ${sessionId}: +${amount} (${learner.xp} → ${newXP})`);

      return {
        xp: newXP,
        level: newLevel,
        leveledUp: newLevel > oldLevel,
      };
    } catch (error) {
      console.error('❌ Failed to add XP:', error);
      throw new Error('Failed to update XP');
    }
  }

  async updateLevel(sessionId: string, level: number): Promise<void> {
    try {
      if (level < 1 || level > 5) {
        throw new Error('Invalid level. Must be 1-5');
      }

      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);

      await updateDoc(learnerRef, {
        level,
        lastActiveAt: serverTimestamp(),
      });

      console.log('✅ Level updated:', sessionId, '→ Level', level);
    } catch (error) {
      console.error('❌ Failed to update level:', error);
      throw new Error('Failed to update learner level');
    }
  }

  async addBadge(sessionId: string, badgeId: string): Promise<boolean> {
    try {
      const learner = await this.findBySessionId(sessionId);
      if (!learner) {
        throw new Error('Learner not found');
      }

      // Check if badge already earned
      if (learner.badges.includes(badgeId)) {
        console.log(`⚠️ Badge ${badgeId} already earned by ${sessionId}`);
        return false;
      }

      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);

      await updateDoc(learnerRef, {
        badges: [...learner.badges, badgeId],
        lastActiveAt: serverTimestamp(),
      });

      console.log(`✅ Badge awarded to ${sessionId}:`, badgeId);
      return true;
    } catch (error) {
      console.error('❌ Failed to add badge:', error);
      throw new Error('Failed to award badge');
    }
  }

  async getBadges(sessionId: string): Promise<string[]> {
    try {
      const learner = await this.findBySessionId(sessionId);
      return learner?.badges ?? [];
    } catch (error) {
      console.error('❌ Failed to get badges:', error);
      throw new Error('Failed to retrieve badges');
    }
  }

  async unlockChallenge(sessionId: string, challengeId: string): Promise<void> {
    try {
      const learner = await this.findBySessionId(sessionId);
      if (!learner) {
        throw new Error('Learner not found');
      }

      // Check if already unlocked
      if (learner.challenges_unlocked.includes(challengeId)) {
        console.log(`⚠️ Challenge ${challengeId} already unlocked for ${sessionId}`);
        return;
      }

      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);

      await updateDoc(learnerRef, {
        challenges_unlocked: [...learner.challenges_unlocked, challengeId],
        lastActiveAt: serverTimestamp(),
      });

      console.log(`✅ Challenge unlocked for ${sessionId}:`, challengeId);
    } catch (error) {
      console.error('❌ Failed to unlock challenge:', error);
      throw new Error('Failed to unlock challenge');
    }
  }

  async completeChallenge(sessionId: string, challengeId: string, xpEarned: number): Promise<void> {
    try {
      const learner = await this.findBySessionId(sessionId);
      if (!learner) {
        throw new Error('Learner not found');
      }

      // Check if already completed
      if (learner.challenges_completed.includes(challengeId)) {
        console.log(`⚠️ Challenge ${challengeId} already completed by ${sessionId}`);
        return;
      }

      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);
      const newXP = learner.xp + xpEarned;
      const newLevel = calculateLevelFromXP(newXP);

      await updateDoc(learnerRef, {
        challenges_completed: [...learner.challenges_completed, challengeId],
        xp: newXP,
        level: newLevel,
        lastActiveAt: serverTimestamp(),
      });

      console.log(`✅ Challenge completed by ${sessionId}: ${challengeId} (+${xpEarned} XP)`);
    } catch (error) {
      console.error('❌ Failed to complete challenge:', error);
      throw new Error('Failed to mark challenge as completed');
    }
  }

  async recordHintUsage(sessionId: string, challengeId: string, count: number): Promise<void> {
    try {
      const learner = await this.findBySessionId(sessionId);
      if (!learner) {
        throw new Error('Learner not found');
      }

      const learnerRef = doc(this.db, COLLECTION_NAME, sessionId);
      const updatedHintsUsed = { ...learner.hints_used, [challengeId]: count };

      await updateDoc(learnerRef, {
        hints_used: updatedHintsUsed,
        lastActiveAt: serverTimestamp(),
      });

      console.log(`✅ Hint usage recorded for ${sessionId} on ${challengeId}:`, count);
    } catch (error) {
      console.error('❌ Failed to record hint usage:', error);
      throw new Error('Failed to record hint usage');
    }
  }

  async getLeaderboard(maxResults = 100, skip = 0): Promise<{
    rank: number;
    learnerId: string;
    displayName: string;
    level: number;
    xp: number;
  }[]> {
    try {
      const learnersRef = collection(this.db, COLLECTION_NAME);

      // Query learners with XP > 0, ordered by XP descending
      const q = query(
        learnersRef,
        where('xp', '>', 0),
        orderBy('xp', 'desc'),
        limit(maxResults + skip) // Firebase SDK doesn't have offset, so we fetch more
      );

      const snapshot = await getDocs(q);
      const leaderboard: any[] = [];

      snapshot.docs.forEach((doc, index) => {
        if (index >= skip) {
          const data = doc.data();
          leaderboard.push({
            rank: skip + leaderboard.length + 1,
            learnerId: doc.id,
            displayName: data.displayName || `Player ${doc.id.slice(0, 8)}`,
            level: data.level ?? 1,
            xp: data.xp ?? 0,
          });
        }
      });

      return leaderboard.slice(0, maxResults);
    } catch (error) {
      console.error('❌ Failed to get leaderboard:', error);
      throw new Error('Failed to retrieve leaderboard');
    }
  }

  async getLeaderboardRank(sessionId: string): Promise<{ rank: number; xp: number; level: number } | null> {
    try {
      const learner = await this.findBySessionId(sessionId);
      if (!learner || learner.xp === 0) {
        return null;
      }

      // Count how many learners have more XP
      const learnersRef = collection(this.db, COLLECTION_NAME);
      const q = query(learnersRef, where('xp', '>', learner.xp));

      const snapshot = await getCountFromServer(q);
      const rank = snapshot.data().count + 1;

      return {
        rank,
        xp: learner.xp,
        level: learner.level,
      };
    } catch (error) {
      console.error('❌ Failed to get leaderboard rank:', error);
      throw new Error('Failed to retrieve leaderboard rank');
    }
  }

  async getTotalLearnersWithXP(): Promise<number> {
    try {
      const learnersRef = collection(this.db, COLLECTION_NAME);
      const q = query(learnersRef, where('xp', '>', 0));

      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      console.error('❌ Failed to get learner count:', error);
      return 0;
    }
  }

  /**
   * Admin/analytics function: Get active learners count
   */
  async getActiveLearnerCount(days: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const learnersRef = collection(this.db, COLLECTION_NAME);
      const q = query(
        learnersRef,
        where('lastActiveAt', '>=', cutoffDate.toISOString())
      );

      const snapshot = await getDocs(q);
      return snapshot.size;
    } catch (error) {
      console.error('❌ Failed to get active learner count:', error);
      return 0;
    }
  }
}