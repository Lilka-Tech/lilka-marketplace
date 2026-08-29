import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, normalize, sep } from 'node:path';
import { createHash } from 'node:crypto';

const canonicalDigest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

const catalogs = ['index.json', 'agents.json', 'agencies.json', 'skills.json', 'appearances.json'];
for (const file of catalogs) {
  const value = JSON.parse(await readFile(join('catalog', file), 'utf8'));
  if (value.schemaVersion !== 1 || !Array.isArray(value.entries)) throw new Error(`Invalid catalog/${file}`);
  const ids = new Set();
  for (const entry of value.entries) {
    const key = `${entry.id}@${entry.version}`;
    if (ids.has(key)) throw new Error(`Duplicate entry ${key}`);
    if (!/^sha256:[a-f0-9]{64}$/.test(entry.digest)) throw new Error(`Invalid digest for ${key}`);
    if (entry.repository !== 'Lilka-Tech/lilka-marketplace') throw new Error(`Invalid repository for ${key}`);
    if (isAbsolute(entry.path) || normalize(entry.path).split(sep).includes('..') || !entry.path.startsWith('packages/free/')) {
      throw new Error(`Invalid package path for ${key}`);
    }
    const packageFile = join(entry.path, 'package.json');
    const payload = JSON.parse(await readFile(packageFile, 'utf8'));
    const packageVersion = payload.version ?? payload.semver;
    if (payload.type !== entry.type || packageVersion !== entry.version) {
      throw new Error(`Package identity mismatch for ${key}`);
    }
    if (canonicalDigest(payload) !== entry.digest) throw new Error(`Package digest mismatch for ${key}`);
    ids.add(key);
  }
}
const forbidden = /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/;
for (const directory of ['catalog', 'packages', 'policies', 'schemas']) for (const name of await readdir(directory, { recursive: true })) {
  const target = join(directory, name.toString());
  const content = await readFile(target, 'utf8').catch(() => '');
  if (forbidden.test(content)) throw new Error(`Potential secret in ${target}`);
}
