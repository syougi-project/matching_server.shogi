import { DomainError } from '@/lib/errors';

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    ...init,
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok) {
    const message = 'ok' in payload && payload.ok === false ? payload.error.message : `HTTP ${response.status}`;
    throw new DomainError('UPSTREAM_HTTP_ERROR', message);
  }
  if ('ok' in payload && payload.ok === true) {
    return payload.data;
  }
  throw new DomainError(
    'UPSTREAM_INVALID_RESPONSE',
    'The upstream service returned an invalid envelope.',
  );
}
