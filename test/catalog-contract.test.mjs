import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry, verifyPayload, canonicalDigest } from '../scripts/catalog-contract.mjs';
const payload = { type:'agent', semver:'1.0.0', agent:{name:'Test',systemPrompt:'Publisher-owned instruction'} };
const entry = { id:'example', name:'Example', type:'agent', version:'1.0.0', publishedAt:'2026-09-09T00:00:00Z', digest:canonicalDigest(payload), source:{kind:'github',owner:'Publisher',repo:'packages',ref:'a'.repeat(40),path:'agents/example',format:'auto'} };
test('accepts immutable publisher references and checks actual bytes', async () => {
  assert.equal(validateEntry(entry),entry);
  assert.deepEqual(await verifyPayload(entry,async (url) => {assert.match(url,/Publisher\/packages\/a{40}\/agents\/example\/package.json$/);return new Response(JSON.stringify(payload));}),payload);
});
test('rejects payloads, mutable refs, catalog-hosted resources and path escapes', () => {
  for (const invalid of [{...entry,agent:{}},{...entry,systemPrompt:'x'},{...entry,source:{...entry.source,ref:'main'}},{...entry,source:{...entry.source,owner:'Lilka-Tech',repo:'lilka-marketplace'}},...['../x','/tmp','foo/../x','foo\\bar','%2e%2e/x','foo?x'].map(path=>({...entry,source:{...entry.source,path}}))]) assert.throws(()=>validateEntry(invalid));
});
test('fails closed on missing, tampered or wrong-version publisher bytes', async () => {
  await assert.rejects(verifyPayload(entry,async()=>new Response('',{status:404})));
  await assert.rejects(verifyPayload(entry,async()=>new Response(JSON.stringify({...payload,agent:{name:'tampered'}}))));
  await assert.rejects(verifyPayload(entry,async()=>new Response(JSON.stringify({...payload,semver:'2.0.0'}))));
});
test('verifies native plugin trees without requiring package.json and rejects symlinks', async () => {
 const files=[{path:'.codex-plugin/plugin.json',bytes:Buffer.from(JSON.stringify({name:'Example',version:'1.0.0'}))},{path:'skills/example/SKILL.md',bytes:Buffer.from('# Example')}];
 const hash=(await import('node:crypto')).createHash('sha256');for(const file of files.sort((a,b)=>a.path.localeCompare(b.path))){hash.update(file.path);hash.update('\0');hash.update(file.bytes);hash.update('\0');}
 const plugin={...entry,type:'plugin',pluginFormat:'codex',digest:`sha256:${hash.digest('hex')}`};let symlink=false;
 const fetcher=async url=>url.startsWith('https://api.github.com/')?new Response(JSON.stringify({tree:files.map(file=>({path:`agents/example/${file.path}`,mode:symlink?'120000':'100644',type:'blob',size:file.bytes.length}))})):new Response(files.find(file=>url.endsWith(file.path)).bytes);
 assert.equal((await verifyPayload(plugin,fetcher)).name,'Example');symlink=true;await assert.rejects(verifyPayload(plugin,fetcher),/regular safe files/);
});
test('tool payload digests recursively sort keys while preserving arrays',async()=>{
 const {canonicalToolValue}=await import('../scripts/catalog-contract.mjs');const tool={version:'1.0.0',type:'tool',z:{b:2,a:1},a:[2,1]};
 const item={...entry,type:'tool',digest:canonicalDigest(canonicalToolValue(tool))};assert.deepEqual(await verifyPayload(item,async()=>new Response(JSON.stringify(tool))),tool);
});
