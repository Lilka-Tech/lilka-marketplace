import {entryPath} from '../scripts/entry-registry.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify, createPublicKey, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const script=resolve('scripts/publish-metadata.mjs');
test('renewal preserves immutable publisher refs, advances rollback version and signs canonical digests',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'catalog-sign-'));const {privateKey,publicKey}=generateKeyPairSync('ed25519');const jwk=publicKey.export({format:'jwk'});
 try{
  await mkdir(join(directory,'catalog'));await mkdir(join(directory,'catalog/entries'));
  const fixture={id:'sample',name:'Sample',description:'Fixture',publishedAt:'2026-09-09T00:00:00.000Z',type:'agent',version:'1.0.0',digest:'sha256:'+ 'c'.repeat(64),source:{format:'auto',kind:'github',owner:'author',repo:'packages',ref:'b'.repeat(40),path:'sample'}};
  await writeFile(join(directory,entryPath(fixture)),JSON.stringify(fixture));await mkdir(join(directory,'metadata'));
  for(const name of ['index','agents','agencies','skills','appearances'])await writeFile(join(directory,`catalog/${name}.json`),JSON.stringify({schemaVersion:2,version:100,entries:[{source:{ref:'b'.repeat(40)}}]}));
  await writeFile(join(directory,'metadata/root.json'),JSON.stringify({signed:{keys:{'root-1':jwk}}}));await writeFile(join(directory,'metadata/snapshot.json'),JSON.stringify({signed:{version:100}}));
  const env={...process.env,GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_NUMBER:'2',LILKA_MARKETPLACE_ED25519_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};
  const result=spawnSync(process.execPath,[script],{cwd:directory,env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const snapshot=JSON.parse(await readFile(join(directory,'metadata/snapshot.json'),'utf8'));const catalog=JSON.parse(await readFile(join(directory,'catalog/index.json'),'utf8'));
  assert.equal(snapshot.signed.version,101);assert.equal(catalog.entries[0].source.ref,'b'.repeat(40));assert.equal(catalog.entries[0].commit,undefined);
  assert.equal(snapshot.signed.catalogs.index.sha256,createHash('sha256').update(JSON.stringify(catalog)).digest('hex'));
  for(const name of ['root','snapshot','timestamp']){const envelope=JSON.parse(await readFile(join(directory,`metadata/${name}.json`),'utf8'));assert(verify(null,Buffer.from(JSON.stringify(envelope.signed)),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(envelope.signatures[0].signature,'base64url')));assert(Date.parse(envelope.signed.expiresAt)>Date.now());}
  const wrong=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});const denied=spawnSync(process.execPath,[script],{cwd:directory,env:{...env,LILKA_MARKETPLACE_ED25519_PRIVATE_KEY:wrong},encoding:'utf8'});assert.notEqual(denied.status,0);assert.match(denied.stderr,/differs from the published trusted root/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
