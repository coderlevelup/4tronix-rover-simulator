'use client';

/**
 * Learner Context Provider
 *
 * Manages anonymous learner sessions and profile data.
 * Automatically initializes session on mount and syncs with Firestore.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { getOrCreateSession, clearSession } from '@/lib/anonymous-auth';
import { Learner, createAnonymousLearner, sanitizeDisplayName } from '@/core/domain/entities/Learner';

interface LearnerContextType {
  learner: Learner | null;
  sessionId: string | null;
  loading: boolean;
  updateDisplayName: (name: string) => Promise<void>;
  resetSession: () => void;
  learnerEmail: string | null;
  setLearnerEmail: (email: string | null) => Promise<void>;
  openEmailPrompt: () => void;
  closeEmailPrompt: () => void;
  showEmailPrompt: boolean;
}

const LearnerContext = createContext<LearnerContextType | undefined>(undefined);

/** Set by MissionWorkspace on every successful submit. */
const LATEST_MISSION_KEY = 'rover-latest-mission-id';

/**
 * The email prompt opens *after* a mission is submitted, so a first-time
 * learner's mission is written with no learnerEmail on it. Since
 * MissionNotificationService gates on that field, that mission would otherwise
 * stay silent for its whole lifecycle - including the completion email, which
 * is the one the learner was just promised.
 *
 * Stamp the address onto the mission they have in flight, then fire the queued
 * email that was skipped at submit time. Best-effort: the learner's email is
 * already saved by the time this runs, so a failure here costs one notification,
 * not the address.
 */
async function backfillLatestMissionEmail(email: string): Promise<void> {
  let missionId: string | null = null;

  try {
    missionId = localStorage.getItem(LATEST_MISSION_KEY);
  } catch {
    return; // localStorage unavailable - nothing to backfill against
  }

  if (!missionId) return;

  try {
    const db = getFirestoreClient();
    const missionRef = doc(db, 'missions', missionId);
    const snapshot = await getDoc(missionRef);

    // Already stamped (e.g. the learner re-saved the same address from the
    // history page) - the queued email has been sent, don't send it twice.
    if (!snapshot.exists() || snapshot.data().learnerEmail) return;

    await updateDoc(missionRef, { learnerEmail: email });

    await fetch(`/api/missions/${missionId}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'queued' }),
    });
  } catch (error) {
    console.warn('Failed to backfill learner email onto pending mission:', error);
  }
}

export function LearnerProvider({ children }: { children: ReactNode }) {
  const [learner, setLearner] = useState<Learner | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [learnerEmail, setLearnerEmailState] = useState<string | null>(null);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);

  useEffect(() => {
    initializeLearnerSession();
  }, []);

  // Load any saved email. We never prompt for it on landing (per David); the
  // email ask happens after a mission is submitted, and on the history page.
  useEffect(() => {
    try {
      const stored = localStorage.getItem('learnerEmail');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage; not readable during SSR render
      if (stored) setLearnerEmailState(stored);
    } catch {
      // localStorage unavailable - skip
    }
  }, []);

  /**
   * Save (or clear) the learner's email - persisted to localStorage and, if a
   * session exists, merged into the learner's Firestore document.
   */
  async function setLearnerEmail(email: string | null): Promise<void> {
    try {
      if (email) localStorage.setItem('learnerEmail', email);
      else localStorage.removeItem('learnerEmail');
    } catch {
      // localStorage unavailable - continue with in-memory state
    }
    setLearnerEmailState(email);
    setShowEmailPrompt(false);

    if (email) await backfillLatestMissionEmail(email);

    if (!sessionId) return;

    try {
      const db = getFirestoreClient();
      const learnerRef = doc(db, 'learners', sessionId);
      await setDoc(
        learnerRef,
        { learnerEmail: email, lastActiveAt: new Date().toISOString() },
        { merge: true },
      );
    } catch (error) {
      console.warn('Failed to persist learner email to Firestore:', error);
    }
  }

  const openEmailPrompt = () => setShowEmailPrompt(true);
  const closeEmailPrompt = () => setShowEmailPrompt(false);

  /**
   * Initialize or retrieve learner session
   */
  async function initializeLearnerSession() {
    try {
      // Get or create browser session
      const session = getOrCreateSession();
      setSessionId(session.sessionId);

      // Try to fetch existing learner from Firestore
      const db = getFirestoreClient();
      const learnerRef = doc(db, 'learners', session.sessionId);
      const learnerSnap = await getDoc(learnerRef);

      if (learnerSnap.exists()) {
        // Existing learner - update last active timestamp
        const existingLearner = learnerSnap.data() as Learner;
        if (existingLearner.learnerEmail) setLearnerEmailState(existingLearner.learnerEmail);

        // Update last active timestamp
        await updateDoc(learnerRef, {
          lastActiveAt: new Date().toISOString(),
        });

        setLearner({ ...existingLearner, lastActiveAt: new Date().toISOString() });
      } else {
        // New learner - create profile
        const newLearner = createAnonymousLearner(session.sessionId);

        await setDoc(learnerRef, {
          ...newLearner,
          // Use Firestore server timestamp for consistency
          createdAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
        });

        setLearner(newLearner);
      }
    } catch (error) {
      console.warn('Firestore learner init unavailable, using local session fallback:', error);

      const session = getOrCreateSession();
      const fallbackLearner = createAnonymousLearner(session.sessionId);
      setSessionId(session.sessionId);
      setLearner(fallbackLearner);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Update learner's display name
   */
  async function updateDisplayName(name: string): Promise<void> {
    if (!sessionId || !learner) {
      throw new Error('No active learner session');
    }

    const sanitized = sanitizeDisplayName(name);
    if (!sanitized) {
      throw new Error('Invalid display name');
    }

    try {
      const db = getFirestoreClient();
      const learnerRef = doc(db, 'learners', sessionId);

      await updateDoc(learnerRef, {
        displayName: sanitized,
        lastActiveAt: new Date().toISOString(),
      });

      setLearner({ ...learner, displayName: sanitized });
    } catch (error) {
      console.error('Failed to update display name:', error);
      throw error;
    }
  }

  /**
   * Reset session and create new learner identity
   */
  function resetSession() {
    clearSession();
    setLearner(null);
    setSessionId(null);
    setLoading(true);
    initializeLearnerSession();
  }

  return (
    <LearnerContext.Provider
      value={{
        learner,
        sessionId,
        loading,
        updateDisplayName,
        resetSession,
        learnerEmail,
        setLearnerEmail,
        openEmailPrompt,
        closeEmailPrompt,
        showEmailPrompt,
      }}
    >
      {children}
    </LearnerContext.Provider>
  );
}

export function useLearner() {
  const context = useContext(LearnerContext);
  if (context === undefined) {
    throw new Error('useLearner must be used within a LearnerProvider');
  }
  return context;
}
