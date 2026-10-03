import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(globalThis, { __PROXY_URL__: 'http://localhost:8787' });
const { classifyFailure, ProxyError, EgressBlockedError } = await import('./proxy.ts');
test('every thrown thing maps to a safe category and raw codes or messages never matter', () => {
  const table: [unknown, string][] = [
    [new EgressBlockedError('unsafe_egress'), 'blocked'],
    [new ProxyError(503, 'no_api_key'), 'not_configured'], [new ProxyError(503, 'whatever'), 'not_configured'],
    [new ProxyError(502, 'upstream_timeout'), 'timeout'], [new ProxyError(504, 'x'), 'timeout'],
    [new ProxyError(502, 'upstream_unreachable'), 'network'],
    [new ProxyError(502, 'model_invalid_output'), 'invalid_output'], [new ProxyError(502, 'model_truncated'), 'invalid_output'],
    [new ProxyError(502, 'upstream_500'), 'unavailable'], [new ProxyError(422, 'invalid_request'), 'unavailable'], [new ProxyError(502, 'CANARY-raw-body-text'), 'unavailable'],
    [new DOMException('The operation timed out. CANARY', 'TimeoutError'), 'timeout'], [new DOMException('aborted', 'AbortError'), 'unavailable'],
    [new TypeError('Failed to fetch CANARY'), 'network'], [new SyntaxError('Unexpected token CANARY'), 'invalid_output'],
    [new Error('CANARY'), 'unavailable'], ['CANARY', 'unavailable'], [undefined, 'unavailable'],
  ];
  for (const [error, kind] of table) assert.equal(classifyFailure(error), kind, String(error));
});
