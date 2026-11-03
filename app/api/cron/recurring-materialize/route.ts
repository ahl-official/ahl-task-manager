import { NextRequest, NextResponse } from 'next/server';
import { isCronOrAdmin } from '@/lib/utils/cronAuth';
import { getRecurringTemplates, materializeRecurringTemplate } from '@/lib/cloudflare/recurring';
import { indiaTodayKey } from '@/lib/utils/indiaDate';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getTargetMonths(targetDate: string): string[] {
  const [y, m, d] = targetDate.split('-').map(Number);
  const currentMonthKey = `${y}-${String(m).padStart(2, '0')}`;

  // Next month
  let nextYear = y;
  let nextMonth = m + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }
  const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

  // On days 28-31, primary target is the upcoming next month
  if (d >= 28) {
    return [nextMonthKey, currentMonthKey];
  }
  return [currentMonthKey, nextMonthKey];
}

export async function GET(req: NextRequest) {
  if (!await isCronOrAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const todayKey = indiaTodayKey();
  const dayOfMonth = Number(todayKey.slice(8, 10));

  // On Vercel Free / Hobby plan, crons run daily (0 18 * * *).
  // On days 2 through 27, exit immediately in 2ms to avoid wasted compute and DB writes.
  const chunkParam = searchParams.get('chunk');
  const isTargetDay = [28, 29, 30, 31, 1].includes(dayOfMonth);
  if (!isTargetDay && chunkParam == null) {
    return NextResponse.json({
      success: true,
      skipped: true,
      dayOfMonth,
      message: `Day ${dayOfMonth}: Materialization only runs on month-end (days 28-31) and 1st.`,
      timestamp: new Date().toISOString(),
    });
  }

  const customMonth = searchParams.get('month');
  const months = customMonth ? [customMonth] : getTargetMonths(todayKey);

  // Divide templates across 28th, 29th, 30th (3 chunks):
  // Day 28: Chunk 0 (First 33%)
  // Day 29: Chunk 1 (Middle 33%)
  // Day 30-31: Chunk 2 (Final 34%)
  // Day 1: Full reconciliation / catch-up sweep (all templates)
  let chunkIndex = -1; // -1 means all
  if (chunkParam != null) {
    chunkIndex = chunkParam.toLowerCase() === 'all' ? -1 : Math.max(0, Math.min(2, Number(chunkParam)));
  } else if (dayOfMonth === 28) {
    chunkIndex = 0;
  } else if (dayOfMonth === 29) {
    chunkIndex = 1;
  } else if (dayOfMonth >= 30) {
    chunkIndex = 2;
  } else {
    chunkIndex = -1; // Day 1 or manual sweep: process all
  }

  const deadline = Date.now() + 270_000; // 4.5 minutes safety buffer for Vercel
  let totalSlots = 0;
  let processedCount = 0;
  const errors: string[] = [];

  try {
    const allTemplates = await getRecurringTemplates({ isActive: true });
    // Stable sort by ID
    allTemplates.sort((a, b) => a.id.localeCompare(b.id));
    const totalTemplates = allTemplates.length;

    let targetTemplates = allTemplates;
    if (chunkIndex >= 0 && totalTemplates > 0) {
      const chunkSize = Math.ceil(totalTemplates / 3);
      const start = chunkIndex * chunkSize;
      const end = Math.min(totalTemplates, start + chunkSize);
      targetTemplates = allTemplates.slice(start, end);
    }

    // Process templates with a controlled concurrency pool of 6
    const concurrency = 6;
    let templateIdx = 0;

    const worker = async () => {
      while (templateIdx < targetTemplates.length) {
        if (Date.now() >= deadline) break;
        const template = targetTemplates[templateIdx++];
        for (const monthKey of months) {
          try {
            const res = await materializeRecurringTemplate(template.id, monthKey);
            totalSlots += res?.inserted || 0;
          } catch (err: any) {
            errors.push(`${template.id} (${monthKey}): ${err.message}`);
          }
        }
        processedCount++;
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, targetTemplates.length) }, () => worker());
    await Promise.all(workers);

    const summary = {
      success: true,
      dayOfMonth,
      chunkIndex: chunkIndex === -1 ? 'all' : chunkIndex,
      totalTemplatesInDb: totalTemplates,
      chunkTemplatesCount: targetTemplates.length,
      processedCount,
      totalSlotsMaterialized: totalSlots,
      months,
      timedOut: Date.now() >= deadline,
      errorCount: errors.length,
      errors: errors.slice(0, 5),
      timestamp: new Date().toISOString(),
    };

    console.info('[recurring-materialize] Completed chunk run:', summary);
    return NextResponse.json(summary);
  } catch (err: any) {
    console.error('[recurring-materialize] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to materialize period rows' }, { status: 500 });
  }
}
