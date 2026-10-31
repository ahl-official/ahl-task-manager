import { NextRequest, NextResponse } from 'next/server';
import { isCronOrAdmin } from '@/lib/utils/cronAuth';
import { cfApi } from '@/lib/cloudflare/api';
import { indiaTodayKey } from '@/lib/utils/indiaDate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getTargetMonths(targetDate: string): string[] {
  const [y, m] = targetDate.split('-').map(Number);
  const currentMonthKey = `${y}-${String(m).padStart(2, '0')}`;

  // Next month
  let nextYear = y;
  let nextMonth = m + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

  return [currentMonthKey, nextMonthKey];
}

export async function GET(req: NextRequest) {
  if (!await isCronOrAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const customMonth = searchParams.get('month');
  const months = customMonth ? [customMonth] : getTargetMonths(indiaTodayKey());

  const deadline = Date.now() + 50_000;
  let totalSlots = 0;
  let offset = 0;
  const limit = 30;
  let pages = 0;

  try {
    for (;;) {
      if (Date.now() >= deadline) break;
      pages++;
      const res = await cfApi<{
        materialize?: {
          periodSlots: number;
          nextOffset: number;
          done: boolean;
          totalDefinitions: number;
        };
        data?: {
          materialize?: {
            periodSlots: number;
            nextOffset: number;
            done: boolean;
            totalDefinitions: number;
          };
        };
      }>('/recurring/migrate-to-period-rows', {
        method: 'POST',
        body: JSON.stringify({
          phase: 'materialize',
          months,
          offset,
          limit,
        }),
      });

      const materialize = res?.materialize || res?.data?.materialize;
      if (!materialize) break;

      totalSlots += materialize.periodSlots || 0;
      if (materialize.done || !materialize.nextOffset || materialize.nextOffset === offset) {
        break;
      }
      offset = materialize.nextOffset;
    }

    const summary = {
      success: true,
      months,
      pagesProcessed: pages,
      totalSlots,
      complete: offset === 0 || totalSlots >= 0,
      timestamp: new Date().toISOString(),
    };
    console.info('[recurring-materialize] Silently completed:', summary);
    return NextResponse.json(summary);
  } catch (err: any) {
    console.error('[recurring-materialize] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to materialize period rows' }, { status: 500 });
  }
}

