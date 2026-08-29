import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const privatePem = process.env.LILKA_MARKETPLACE_ED25519_PRIVATE_KEY;
if (!privatePem) throw new Error('LILKA_MARKETPLACE_ED25519_PRIVATE_KEY is required');
const key = createPrivateKey(privatePem);
const publicJwk = createPublicKey(key).export({ format: 'jwk' });
const now = new Date();
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const envelope = (signed) => ({ signed, signatures: [{ keyid: 'root-1', algorithm: 'EdDSA', signature: sign(null, Buffer.from(JSON.stringify(signed)), key).toString('base64url') }] });
const root = { schemaVersion: 1, version: 1, expiresAt: new Date(now.getTime() + 366 * 86400000).toISOString(), keys: { 'root-1': publicJwk }, threshold: 1 };
const catalogs = {};
for (const name of ['index', 'agents', 'agencies', 'skills', 'appearances']) catalogs[name] = JSON.parse(await readFile(`catalog/${name}.json`, 'utf8'));
const snapshot = {
  schemaVersion: 1,
  version: Number(process.env.GITHUB_RUN_NUMBER ?? 1),
  expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
  catalogs: Object.fromEntries(
    Object.entries(catalogs).map(([name, value]) => [
      name,
      {
        sha256: createHash('sha256').update(JSON.stringify(value)).digest('hex'),
        version: value.version,
      },
    ]),
  ),
};
const timestamp = { schemaVersion: 1, version: snapshot.version, expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(), snapshotVersion: snapshot.version };
await writeFile('metadata/root.json', `${JSON.stringify(envelope(root), null, 2)}\n`);
await writeFile('metadata/snapshot.json', `${JSON.stringify(envelope(snapshot), null, 2)}\n`);
await writeFile('metadata/timestamp.json', `${JSON.stringify(envelope(timestamp), null, 2)}\n`);
