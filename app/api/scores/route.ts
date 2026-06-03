import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminGetAllScores, adminGetScore, serializeScore } from '@/lib/firebase/scores';
import { filterScoresForSession } from '@/lib/utils/access';

// GET /api/scores?uid=...
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid');

  if (uid) {
    const score = await adminGetScore(uid);
    if (score && filterScoresForSession(session, [score]).length === 0) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: score ? serializeScore(score) : null });
  }

  const scores = filterScoresForSession(session, await adminGetAllScores());
  return NextResponse.json({ success: true, data: scores.map(serializeScore) });
}
