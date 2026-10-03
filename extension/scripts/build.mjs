import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const proxy = (process.env.PROXY_URL || 'http://localhost:8787').replace(/\/$/, '');
const outdir = resolve(root, process.env.OUT_DIR || 'dist');
// Limit destructive output cleanup to dedicated build directories.
if (![resolve(root, 'dist'), resolve(root, 'dist-e2e')].includes(outdir)) throw new Error('OUT_DIR must be dist or dist-e2e');
await rm(outdir, { recursive: true, force: true });
const common = { absWorkingDir: root, outdir, bundle: true, target: 'es2022', platform: 'browser', sourcemap: 'linked', minifySyntax: true,
  define: { __PROXY_URL__: JSON.stringify(proxy), __E2E__: process.env.E2E === '1' ? 'true' : 'false' } };
await Promise.all([
  build({ ...common, entryPoints: { 'background/sw': 'src/background/index.ts' }, format: 'esm' }),
  build({ ...common, entryPoints: { 'content/content': 'src/content/index.ts', 'offscreen/offscreen': 'src/offscreen/offscreen.ts' }, format: 'iife' }),
]);
await mkdir(resolve(outdir, 'offscreen'), { recursive: true });
await cp(resolve(root, 'static/offscreen.html'), resolve(outdir, 'offscreen/offscreen.html'));
const manifest = (await readFile(resolve(root, 'static/manifest.json'), 'utf8')).replaceAll('__PROXY_ORIGIN__', new URL(proxy).origin);
if (manifest.includes('__PROXY_ORIGIN__')) throw new Error('Unresolved proxy origin');
await writeFile(resolve(outdir, 'manifest.json'), manifest);
