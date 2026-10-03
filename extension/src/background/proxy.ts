import { maskText } from '../shared/mask.ts';
export class EgressBlockedError extends Error {}
export class ProxyError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
export function assertEgressClean(serialized: string): void {
  if (maskText(serialized) !== serialized) throw new EgressBlockedError('unsafe_egress');
}
export async function postJson<T>(path: '/api/action' | '/api/effect', body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const serialized = JSON.stringify(body);
  assertEgressClean(serialized);
  const response = await fetch(__PROXY_URL__ + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: serialized, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'proxy_error' })) as { error?: string };
    throw new ProxyError(response.status, error.error ?? 'proxy_error');
  }
  return response.json() as Promise<T>;
}
