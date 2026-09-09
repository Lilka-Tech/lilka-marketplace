import {createHash} from 'node:crypto';
import {readdir,readFile,lstat} from 'node:fs/promises';
import {validateEntry} from './catalog-contract.mjs';
export const entryPath = e => `catalog/entries/${createHash('sha256').update(`${e.type}:${e.id}@${e.version}`).digest('hex')}.json`;
export function compileEntries(entries) {
 const seen=new Set(); for(const e of entries){validateEntry(e); const key=`${e.type}:${e.id}@${e.version}`;if(seen.has(key))throw new Error(`Duplicate entry ${key}`);seen.add(key);}
 const sorted=[...entries].sort((a,b)=>`${a.type}:${a.id}@${a.version}`.localeCompare(`${b.type}:${b.id}@${b.version}`));
 return {index:sorted,agents:sorted.filter(e=>e.type==='agent'),agencies:sorted.filter(e=>e.type==='agency'),skills:sorted.filter(e=>e.type==='skill'),appearances:sorted.filter(e=>['theme','iconTheme'].includes(e.type))};
}
export async function readRegistry(root='.') {
 const entries=[];for(const name of await readdir(`${root}/catalog/entries`)){const file=`catalog/entries/${name}`;if(!/^[a-f0-9]{64}\.json$/.test(name)||(await lstat(`${root}/${file}`)).isSymbolicLink())throw new Error(`Invalid registry path ${file}`);const e=JSON.parse(await readFile(`${root}/${file}`,'utf8'));if(entryPath(e)!==file)throw new Error(`Entry identity/path mismatch ${file}`);entries.push(e);}return compileEntries(entries);
}
