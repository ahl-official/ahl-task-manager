const ACCOUNT_ID = 'b20892b35b7ece3670ecaf46e879d5c7';

/**
 * Cloudflare D1 Daily Usage Guard Thresholds
 * - Writes soft limit: 80,000 writes / day (Cloudflare hard limit is 100,000)
 * - Reads soft limit: 4,500,000 reads / day (Cloudflare hard limit is 5,000,000)
 */
export const D1_READ_SOFT_LIMIT = 4_500_000;
export const D1_WRITE_SOFT_LIMIT = 80_000;

export async function getTodayD1Usage(): Promise<{ rowsRead: number; rowsWritten: number }> {
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_ANALYTICS_TOKEN is not configured');

  // Cloudflare's daily billing counters are grouped by UTC date.
  const date = new Date().toISOString().slice(0, 10);
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `query D1DailyUsage($accountTag: String!, $date: Date!) {
        viewer { accounts(filter: { accountTag: $accountTag }) {
          d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $date, date_leq: $date }) {
            sum { rowsRead rowsWritten }
          }
        } }
      }`,
      variables: { accountTag: ACCOUNT_ID, date },
    }),
    cache: 'no-store',
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(`Cloudflare usage lookup failed: ${payload.errors?.[0]?.message || response.status}`);
  }
  const groups = payload.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
  if (!Array.isArray(groups)) throw new Error('Cloudflare usage response omitted D1 metrics');
  if (groups.length === 0) {
    return { rowsRead: 0, rowsWritten: 0 };
  }
  return groups.reduce((total: { rowsRead: number; rowsWritten: number }, group: any) => {
    const rowsRead = Number(group.sum?.rowsRead), rowsWritten = Number(group.sum?.rowsWritten);
    if (!Number.isFinite(rowsRead) || !Number.isFinite(rowsWritten)) {
      throw new Error('Cloudflare usage response contained incomplete D1 metrics');
    }
    return { rowsRead: total.rowsRead + rowsRead, rowsWritten: total.rowsWritten + rowsWritten };
  }, { rowsRead: 0, rowsWritten: 0 });
}

export type D1BudgetStatus = {
  allowed: boolean;
  rowsRead?: number;
  rowsWritten?: number;
  reason?: string;
  source: 'cloudflare_analytics' | 'untracked';
};

/**
 * Checks if the recurring materialization trigger should run based on D1 usage:
 * - Block if daily writes >= 80,000 (80k)
 * - Block if daily reads >= 4,500,000 (4.5M)
 * If blocked, returns allowed: false so the trigger halts and defers to next day's cron.
 */
export async function checkD1RecurringBudget(): Promise<D1BudgetStatus> {
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
  if (!token) {
    // If analytics token is not set, allow execution but note it's untracked
    return { allowed: true, source: 'untracked' };
  }

  try {
    const usage = await getTodayD1Usage();
    if (usage.rowsWritten >= D1_WRITE_SOFT_LIMIT) {
      return {
        allowed: false,
        rowsRead: usage.rowsRead,
        rowsWritten: usage.rowsWritten,
        reason: `D1 write limit reached: ${usage.rowsWritten.toLocaleString()} writes today (threshold: ${D1_WRITE_SOFT_LIMIT.toLocaleString()}). Postponing materialization trigger to next day.`,
        source: 'cloudflare_analytics',
      };
    }
    if (usage.rowsRead >= D1_READ_SOFT_LIMIT) {
      return {
        allowed: false,
        rowsRead: usage.rowsRead,
        rowsWritten: usage.rowsWritten,
        reason: `D1 read limit reached: ${usage.rowsRead.toLocaleString()} reads today (threshold: ${D1_READ_SOFT_LIMIT.toLocaleString()}). Postponing materialization trigger to next day.`,
        source: 'cloudflare_analytics',
      };
    }
    return {
      allowed: true,
      rowsRead: usage.rowsRead,
      rowsWritten: usage.rowsWritten,
      source: 'cloudflare_analytics',
    };
  } catch (err: any) {
    console.warn('[checkD1RecurringBudget] Analytics check error:', err.message);
    // On unexpected analytics lookup error, proceed so materialization isn't permanently stalled
    return {
      allowed: true,
      reason: `Analytics warning: ${err.message}`,
      source: 'untracked',
    };
  }
}
