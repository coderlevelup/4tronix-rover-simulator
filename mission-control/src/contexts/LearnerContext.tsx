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

export function LearnerProvider({ children }: { children: ReactNode }) {
  const [learner, setLearner] = useState<Learner | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [learnerEmail, setLearnerEmailState] = useState<string | null>(null);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);

  useEffect(() => {
    console.log('🎓 Initializing LearnerContext');
    initializeLearnerSession();
  }, []);

  // Load any saved email. We never prompt for it on landing (per David); the
  // email ask happens after a mission is submitted, and on the history page.
  useEffect(() => {
    try {
      const stored = localStorage.getItem('learnerEmail');
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
      console.warn('⚠️ Failed to persist learner email to Firestore:', error);
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
        console.log('👋 Welcome back, learner:', existingLearner.displayName || session.sessionId);
        if (existingLearner.learnerEmail) setLearnerEmailState(existingLearner.learnerEmail);

        // Update last active timestamp
        await updateDoc(learnerRef, {
          lastActiveAt: new Date().toISOString(),
        });

        setLearner({ ...existingLearner, lastActiveAt: new Date().toISOString() });
      } else {
        // New learner - create profile
        const newLearner = createAnonymousLearner(session.sessionId);
        console.log('✨ Creating new learner:', session.sessionId);

        await setDoc(learnerRef, {
          ...newLearner,
          // Use Firestore server timestamp for consistency
          createdAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
        });

        setLearner(newLearner);
      }
    } catch (error) {
      console.warn('⚠️ Firestore learner init unavailable, using local session fallback:', error);

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
      console.log('✅ Display name updated:', sanitized);
    } catch (error) {
      console.error('❌ Failed to update display name:', error);
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
