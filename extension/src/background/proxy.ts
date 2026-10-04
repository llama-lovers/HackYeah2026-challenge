import type { FailureKind } from '../shared/protocol.ts';
export class EgressBlockedError extends Error {}
export class ProxyError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
export async function postJson<T>(path: '/api/action' | '/api/effect' | '/api/explore' | '/api/browser-action', body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const serialized = JSON.stringify(body);
  const response = await fetch(__PROXY_URL__ + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: serialized, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'proxy_error' })) as { error?: string };
    throw new ProxyError(response.status, error.error ?? 'proxy_error');
  }
  return response.json() as Promise<T>;
}
// Maps anything a proxy call can throw to a safe category. The raw code, status text and exception message are inspected here and nowhere else:
// they never reach speech or logs, so a hostile or buggy response body cannot become output.
export function classifyFailure(error: unknown): FailureKind {
  if (error instanceof EgressBlockedError) return 'blocked';
  if (error instanceof ProxyError) {
    if (error.status === 503 || error.code === 'no_api_key') return 'not_configured';
    if (error.status === 504 || error.code === 'upstream_timeout') return 'timeout';
    if (error.code === 'upstream_unreachable') return 'network';
    if (error.code === 'model_invalid_output' || error.code === 'model_truncated') return 'invalid_output';
    return 'unavailable';
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
  if (error instanceof SyntaxError) return 'invalid_output';
  if (error instanceof TypeError) return 'network';
  return 'unavailable';
}
