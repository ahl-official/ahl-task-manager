import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminGetAllScores, adminGetScore, serializeScore } from '@/lib/firebase/scores';

// GET /api/scores?uid=...
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid');

  if (uid) {
    // User can only fetch their own score unless admin
    if (uid !== session.uid && session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const score = await adminGetScore(uid);
    return NextResponse.json({ success: true, data: score ? serializeScore(score) : null });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const scores = await adminGetAllScores();
  return NextResponse.json({ success: true, data: scores.map(serializeScore) });
}
