const ACCOUNT_ID = 'b20892b35b7ece3670ecaf46e879d5c7';

export const D1_READ_SOFT_LIMIT = 4_000_000;
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
  if (groups.length === 0) throw new Error('Cloudflare usage has no data for today; skipping sync');
  return groups.reduce((total: { rowsRead: number; rowsWritten: number }, group: any) => {
    const rowsRead = Number(group.sum?.rowsRead), rowsWritten = Number(group.sum?.rowsWritten);
    if (!Number.isFinite(rowsRead) || !Number.isFinite(rowsWritten)) {
      throw new Error('Cloudflare usage response contained incomplete D1 metrics');
    }
    return { rowsRead: total.rowsRead + rowsRead, rowsWritten: total.rowsWritten + rowsWritten };
  }, { rowsRead: 0, rowsWritten: 0 });
}
