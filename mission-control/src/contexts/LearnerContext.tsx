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
import { getLearnerID } from '@/lib/getLearnerID';
import { hashLearnerEmail } from '@/core/domain/services/learnerEmailHash';
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
 * Learner records are keyed by getLearnerID(), the SAME id missions carry as
 * `learnerId`. They used to be keyed by getOrCreateSession()'s sessionId, a
 * separate nanoid under a different localStorage key, so the server could never
 * find a mission's learner - which is both why emails greeted "Space Explorer"
 * and why the address now has somewhere reliable to live.
 *
 * Existing documents under the old sessionId key are orphaned by this change.
 * Nothing is lost that matters: they hold only an email and display name, and
 * the email is also in localStorage, so it is rewritten under the correct id
 * the next time the learner saves it.
 */
function learnerDocId(): string {
  return getLearnerID();
}

/**
 * The email prompt opens *after* a mission is submitted, so a first-time
 * learner's mission is written with no learnerEmailHash on it, and the
 * notification service has no way to connect that mission to an address. That
 * mission would otherwise stay silent for its whole lifecycle - including the
 * completion email, which is the one the learner was just promised.
 *
 * Stamps the HASH onto the mission in flight (never the address: mission
 * documents are world-readable), then fires the queued email that was skipped
 * at submit time. Best-effort: the address is already saved to the learner
 * record by the time this runs, so a failure here costs one notification, not
 * the address.
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
    if (!snapshot.exists() || snapshot.data().learnerEmailHash) return;

    await updateDoc(missionRef, { learnerEmailHash: await hashLearnerEmail(email) });

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

    // Order matters. The learner record is now the ONLY place the address
    // lives, and backfillLatestMissionEmail triggers a notify that reads it
    // back server-side - so persist here first or that email finds no address
    // and silently skips.
    //
    // Deliberately not gated on `sessionId`: the document id comes from
    // learnerDocId(), not session state, and skipping this write would leave
    // the learner reachable by nothing at all.
    try {
      const db = getFirestoreClient();
      const learnerRef = doc(db, 'learners', learnerDocId());
      await setDoc(
        learnerRef,
        { learnerEmail: email, lastActiveAt: new Date().toISOString() },
        { merge: true },
      );
    } catch (error) {
      console.warn('Failed to persist learner email to Firestore:', error);
    }

    if (email) await backfillLatestMissionEmail(email);
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
      const learnerRef = doc(db, 'learners', learnerDocId());
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
      const learnerRef = doc(db, 'learners', learnerDocId());

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
