import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const privatePem = process.env.LILKA_MARKETPLACE_ED25519_PRIVATE_KEY;
if (!privatePem) throw new Error('LILKA_MARKETPLACE_ED25519_PRIVATE_KEY is required');
const key = createPrivateKey(privatePem);
const publicJwk = createPublicKey(key).export({ format: 'jwk' });
const now = new Date();
const publicationCommit = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(publicationCommit ?? '')) throw new Error('GITHUB_SHA must be a full commit SHA');
const publicationVersion = Number(process.env.GITHUB_RUN_NUMBER ?? 1);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const envelope = (signed) => ({ signed, signatures: [{ keyid: 'root-1', algorithm: 'EdDSA', signature: sign(null, Buffer.from(JSON.stringify(signed)), key).toString('base64url') }] });
const root = { schemaVersion: 1, version: 1, expiresAt: new Date(now.getTime() + 366 * 86400000).toISOString(), keys: { 'root-1': publicJwk }, threshold: 1 };
const catalogs = {};
for (const name of ['index', 'agents', 'agencies', 'skills', 'appearances']) {
  const catalog = JSON.parse(await readFile(`catalog/${name}.json`, 'utf8'));
  catalog.version = publicationVersion;
  catalog.commit = publicationCommit;
  catalog.generatedAt = now.toISOString();
  catalog.entries = catalog.entries.map((entry) => ({ ...entry, commit: publicationCommit }));
  catalogs[name] = catalog;
  await writeFile(`catalog/${name}.json`, `${JSON.stringify(catalog, null, 2)}\n`);
}
const snapshot = {
  schemaVersion: 1,
  version: publicationVersion,
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
