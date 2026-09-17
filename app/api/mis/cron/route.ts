import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import {
  addDataToMISData,
  archiveData,
  generateAndSendReports,
} from '@/lib/mis/appsScript';
import { generateAndSendMonthlyMisReports } from '@/lib/mis/monthlyReport';
import { archiveMisGaps, saveMisWeeklySnapshots } from '@/lib/mis/weeklySnapshot';

function authorized(req: NextRequest) {
  const headerSecret = req.headers.get('x-cron-secret');
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (process.env.CRON_SECRET && (headerSecret === process.env.CRON_SECRET || bearer === process.env.CRON_SECRET)) {
    return true;
  }
  return false;
}

function logCron(level: 'info' | 'warn' | 'error', action: string, message: string, extra?: unknown) {
  const prefix = `[MIS cron] action=${action}`;
  if (level === 'error') {
    console.error(prefix, message, extra ?? '');
  } else if (level === 'warn') {
    console.warn(prefix, message, extra ?? '');
  } else {
    console.log(prefix, message, extra ?? '');
  }
}

function summarizeResult(action: string, data: unknown) {
  if (!data || typeof data !== 'object') return;
  const row = data as Record<string, unknown>;

  if (Array.isArray(row.errors) && row.errors.length > 0) {
    logCron('error', action, `completed with ${row.errors.length} error(s)`, row.errors);
  }

  if (row.skipped === true) {
    logCron('warn', action, String(row.reason || 'skipped'), {
      sent: row.sent,
      reportCount: row.reportCount,
    });
    return;
  }

  if (action === 'weekly') {
    const written = Number(row.written ?? 0);
    if (written <= 0) {
      logCron('warn', action, 'wrote 0 misWeekly rows — check sheets/CF sources or Firebase', {
        weekKey: row.weekKey,
        weekStart: row.weekStart,
        weekEnd: row.weekEnd,
        people: row.people,
      });
    } else {
      logCron('info', action, `wrote ${written} misWeekly row(s)`, {
        weekKey: row.weekKey,
        weekStart: row.weekStart,
        weekEnd: row.weekEnd,
        people: row.people,
      });
    }
    return;
  }

  if ('sent' in row || 'reportCount' in row) {
    logCron('info', action, 'finished', {
      sent: row.sent,
      skipped: row.skipped,
      reportCount: row.reportCount,
      errorCount: Array.isArray(row.errors) ? row.errors.length : 0,
    });
  }
}

async function runAction(action: string, body: Record<string, unknown> = {}) {
  // Exact Apps Script ports (sheet MIS Data / Archive / optional sheet PDF)
  if (action === 'archiveData' || action === 'archive') {
    // Prefer exact sheet Archive write; keep Firebase archive as optional side log
    const sheet = await archiveData();
    try {
      await archiveMisGaps({ weekStart: typeof body.weekStart === 'string' ? body.weekStart : undefined });
    } catch (err) {
      logCron('warn', action, 'Firebase misArchive side-write failed (sheet archive still ok)', String(err));
    }
    return sheet;
  }

  if (action === 'addDataToMISData' || action === 'addData') {
    return addDataToMISData();
  }

  if (action === 'generateAndSendReports' || action === 'monthlyFromSheet') {
    return generateAndSendReports({
      dryRun: Boolean(body.dryRun),
      onlyName: typeof body.onlyName === 'string' ? body.onlyName : undefined,
    });
  }

  // Default monthly: build w1–w5/ms from Cloudflare mis_weekly (production path).
  // Do NOT use sheet Week/Month Report for production monthly sends.
  if (action === 'runMonthlyReports' || action === 'monthly') {
    return generateAndSendMonthlyMisReports({
      force: Boolean(body.force),
      dryRun: Boolean(body.dryRun),
      year: typeof body.year === 'number' ? body.year : undefined,
      monthIndex0: typeof body.monthIndex0 === 'number' ? body.monthIndex0 : undefined,
    });
  }

  // Legacy sheet Week/Month Report send — disabled for production; prefer action=monthly
  if (action === 'runMonthlyReportsFromSheet' || action === 'monthlySheet' || action === 'monthlyFromSheet' || action === 'generateAndSendReports') {
    logCron('warn', action, 'sheet monthly path is legacy; production uses mis_weekly via action=monthly');
    return generateAndSendReports({
      dryRun: Boolean(body.dryRun),
      onlyName: typeof body.onlyName === 'string' ? body.onlyName : undefined,
    });
  }

  // App-computed weekly snapshots → Cloudflare mis_weekly
  // Sources: Checklist Masters + Delegation (Cloudflare One Time) + FMS sheet tabs
  if (action === 'weekly') {
    return saveMisWeeklySnapshots({
      weekStart: typeof body.weekStart === 'string' ? body.weekStart : undefined,
      weekEnd: typeof body.weekEnd === 'string' ? body.weekEnd : undefined,
    });
  }

  throw new Error('Unknown action');
}

async function handleCron(method: 'GET' | 'POST', action: string, body: Record<string, unknown> = {}) {
  const started = Date.now();
  logCron('info', action, `${method} started`, {
    force: Boolean(body.force),
    dryRun: Boolean(body.dryRun),
    weekStart: body.weekStart,
    weekEnd: body.weekEnd,
  });

  try {
    const data = await runAction(action, body);
    summarizeResult(action, data);
    logCron('info', action, `${method} ok (${Date.now() - started}ms)`);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logCron('error', action, `${method} FAILED (${Date.now() - started}ms): ${message}`, stack || err);
    return NextResponse.json(
      {
        success: false,
        error: message,
        action,
        at: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const cronOk = authorized(req);
  const session = cronOk ? null : await getSession();
  if (!cronOk && (!session || session.role !== 'admin')) {
    logCron('error', 'auth', 'POST unauthorized');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || 'weekly');
  return handleCron('POST', action, body);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    logCron('error', 'auth', 'GET unauthorized — check CRON_SECRET');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const action = new URL(req.url).searchParams.get('action') || 'weekly';
  return handleCron('GET', action, { force: false });
}
