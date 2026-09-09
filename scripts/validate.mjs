import { readFile, readdir, lstat } from 'node:fs/promises';
import { validateEntry, verifyPayload } from './catalog-contract.mjs';
import {readRegistry} from './entry-registry.mjs';
const registry=await readRegistry();
const catalogs={index:{entries:registry.index}};
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
