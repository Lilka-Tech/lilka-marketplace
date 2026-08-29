import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const catalogs = ['index.json', 'agents.json', 'agencies.json', 'skills.json', 'appearances.json'];
for (const file of catalogs) {
  const value = JSON.parse(await readFile(join('catalog', file), 'utf8'));
  if (value.schemaVersion !== 1 || !Array.isArray(value.entries)) throw new Error(`Invalid catalog/${file}`);
  const ids = new Set();
  for (const entry of value.entries) {
    const key = `${entry.id}@${entry.version}`;
    if (ids.has(key)) throw new Error(`Duplicate entry ${key}`);
    if (!/^sha256:[a-f0-9]{64}$/.test(entry.digest)) throw new Error(`Invalid digest for ${key}`);
    if (ids.has(key)) throw new Error(`Duplicate entry ${key}`);
    ids.add(key);
  }
}
const forbidden = /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/;
for (const directory of ['catalog', 'packages', 'policies', 'schemas']) for (const name of await readdir(directory, { recursive: true })) {
  const target = join(directory, name.toString());
  const content = await readFile(target, 'utf8').catch(() => '');
  if (forbidden.test(content)) throw new Error(`Potential secret in ${target}`);
}
