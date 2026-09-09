import { readFile, readdir, lstat } from 'node:fs/promises';
import { validateEntry, verifyPayload } from './catalog-contract.mjs';
const types = { agents: ['agent'], agencies: ['agency'], skills: ['skill'], appearances: ['theme','iconTheme'] };
const catalogs = {};
for (const name of ['index', ...Object.keys(types)]) {
  const value = JSON.parse(await readFile(`catalog/${name}.json`, 'utf8'));
  if (value.schemaVersion !== 2 || !Array.isArray(value.entries)) throw new Error(`Invalid catalog ${name}`);
  const ids = new Set();
  for (const entry of value.entries) {
    validateEntry(entry);
    const identity = `${entry.type}:${entry.id}@${entry.version}`;
    if (ids.has(identity)) throw new Error(`Duplicate entry ${identity}`);
    ids.add(identity);
  }
  catalogs[name] = value;
}
for (const [name, kinds] of Object.entries(types)) {
  const expected = catalogs.index.entries.filter((entry) => kinds.includes(entry.type));
  const canonical = (entries) => JSON.stringify([...entries].sort((a,b) => `${a.type}:${a.id}@${a.version}`.localeCompare(`${b.type}:${b.id}@${b.version}`)));
  if (canonical(expected) !== canonical(catalogs[name].entries)) throw new Error(`Catalog ${name} differs from index`);
}
if (await lstat('packages').catch(() => null)) throw new Error('Payload directory packages/ is forbidden in the catalog');
for (const entry of catalogs.index.entries) await verifyPayload(entry);
const forbidden = /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/;
for (const directory of ['catalog','policies','schemas']) for (const name of await readdir(directory,{recursive:true})) {
  const target = `${directory}/${name}`;
  const stat = await lstat(target);
  if (stat.isSymbolicLink()) throw new Error(`Symlink forbidden: ${target}`);
  if (stat.isFile() && forbidden.test(await readFile(target,'utf8'))) throw new Error(`Potential secret: ${target}`);
}
console.log(`Validated ${catalogs.index.entries.length} immutable publisher references`);
