import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';

const LEARNERS = 'learners';

/**
 * GET /api/leaderboard
 *
 * Server route — uses the Firebase ADMIN SDK (not the web SDK). The web SDK's
 * gRPC/long-poll transport is unreliable in Node and was hanging this route for
 * 30–80s; the Admin SDK is built for the server and is fast + stable.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');
    const learnerId = searchParams.get('learnerId');

    const db = getFirestoreInstance();

    // Single-learner rank lookup
    if (learnerId) {
      const snap = await db.collection(LEARNERS).doc(learnerId).get();
      const data = snap.exists ? snap.data() : undefined;
      const xp = (data?.xp as number) ?? 0;

      if (!data || xp === 0) {
        return NextResponse.json({
          success: true,
          learnerRank: null,
          message: 'Learner not on leaderboard yet',
        });
      }

      const ahead = await db.collection(LEARNERS).where('xp', '>', xp).count().get();
      return NextResponse.json({
        success: true,
        learnerRank: { rank: ahead.data().count + 1, xp, level: (data.level as number) ?? 1 },
      });
    }

    // Leaderboard page (Firestore has no offset — fetch limit+offset, then slice)
    const pageSnap = await db
      .collection(LEARNERS)
      .where('xp', '>', 0)
      .orderBy('xp', 'desc')
      .limit(limit + offset)
      .get();

    const leaderboard = pageSnap.docs.slice(offset).map((doc, index) => {
      const data = doc.data();
      return {
        rank: offset + index + 1,
        learnerId: doc.id,
        displayName: data.displayName || `Player ${doc.id.slice(0, 8)}`,
        level: data.level ?? 1,
        xp: data.xp ?? 0,
      };
    });

    const totalSnap = await db.collection(LEARNERS).where('xp', '>', 0).count().get();
    const total = totalSnap.data().count;

    return NextResponse.json({
      success: true,
      leaderboard,
      pagination: { limit, offset, total, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error('❌ Leaderboard error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve leaderboard',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
