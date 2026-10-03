import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function extensionIdFromPublicKeyDer(der) {
  return [...createHash('sha256').update(der).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
}
export function extensionIdFromKey(keyB64) { return extensionIdFromPublicKeyDer(Buffer.from(keyB64, 'base64')); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--id') {
    const manifest = JSON.parse(await readFile(process.argv[3], 'utf8'));
    console.log(extensionIdFromKey(manifest.key));
  } else if (process.argv.length === 2) {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const der = publicKey.export({ type: 'spki', format: 'der' });
    console.log(JSON.stringify({ key: der.toString('base64'), id: extensionIdFromPublicKeyDer(der) }, null, 2));
  } else throw new Error('Usage: gen-key.mjs [--id manifestPath]');
}
