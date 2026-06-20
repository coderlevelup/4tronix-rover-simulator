import { NextResponse } from 'next/server';
import { CHALLENGES } from '@/data/challenges';

export async function GET() {
  try {
    return NextResponse.json({ success: true, challenges: CHALLENGES });
  } catch (error) {
    console.error('❌ Failed to return challenges:', error);
    return NextResponse.json({ success: false, error: 'Failed to load challenges' }, { status: 500 });
  }
}
