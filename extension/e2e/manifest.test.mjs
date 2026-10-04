import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile(new URL('../static/manifest.json', import.meta.url), 'utf8'));
test('temporary page access uses activeTab and scripting without broadening persistent host access', () => {
  assert(manifest.permissions.includes('activeTab') && manifest.permissions.includes('scripting'));
  assert.deepEqual(manifest.host_permissions, ['__PROXY_ORIGIN__/*']);
  assert(!manifest.permissions.some(p => p === 'tabs' || p === 'webNavigation' || p === 'debugger'));
  assert.equal(manifest.optional_host_permissions, undefined);
});
test('declarative content scripts cover supported InPost/Google sites and local fixtures', () => {
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://inpost.pl/*', 'https://www.inpost.pl/*', 'https://google.com/*', 'https://www.google.com/*', 'https://google.pl/*', 'https://www.google.pl/*', 'https://youtube.com/*', 'https://www.youtube.com/*', 'https://m.youtube.com/*', '__PROXY_ORIGIN__/fixtures/*']);
  assert.deepEqual(manifest.content_scripts[0].js, ['content/content.js']);
  assert.notEqual(manifest.content_scripts[0].all_frames, true);
  for (const pattern of [...manifest.host_permissions, ...manifest.content_scripts[0].matches]) assert(!/<all_urls>|^\*:\/\/\*\/|^https?:\/\/\*\//.test(pattern), pattern);
});
