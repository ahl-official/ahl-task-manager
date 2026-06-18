const API_URL = process.env.CLOUDFLARE_API_URL || process.env.NEXT_PUBLIC_CLOUDFLARE_API_URL || '';
const API_SECRET = process.env.CLOUDFLARE_API_SECRET || process.env.API_SHARED_SECRET || process.env.CRON_SECRET || '';

export class CloudflareApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CloudflareApiError';
    this.status = status;
  }
}

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export function hasCloudflareApi() {
  return !!API_URL;
}

export async function cfApi<T>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean; fallback?: T } = {},
): Promise<T> {
  if (!API_URL) {
    if ('fallback' in options) return options.fallback as T;
    throw new CloudflareApiError('CLOUDFLARE_API_URL is not configured', 500);
  }

  const headers = new Headers(init.headers);
  headers.set('content-type', headers.get('content-type') || 'application/json');
  if (options.auth !== false && API_SECRET) headers.set('authorization', `Bearer ${API_SECRET}`);

  const res = await fetch(`${API_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  const payload = await res.json().catch(() => ({ success: false, error: res.statusText })) as ApiEnvelope<T>;
  if (!res.ok || !payload.success) {
    throw new CloudflareApiError(payload.error || 'Cloudflare API request failed', res.status);
  }

  return payload.data as T;
}

export async function cfEnvelope<T>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean } = {},
): Promise<ApiEnvelope<T>> {
  try {
    const data = await cfApi<T>(path, init, options);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Request failed' };
  }
}
