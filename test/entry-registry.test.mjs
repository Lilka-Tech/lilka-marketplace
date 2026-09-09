import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileEntries,entryPath} from '../scripts/entry-registry.mjs';
const e={id:'author/a',name:'A',description:'Fixture',publishedAt:'2026-09-09T00:00:00.000Z',type:'skill',version:'1.0.0',digest:'sha256' + ':' + 'a'.repeat(64),source:{format:'auto',kind:'github',owner:'author',repo:'packages',ref:'b'.repeat(40),path:'skill'}};
test('independent author additions compile together without replacing another entry',()=>{const b={...e,id:'author/b'};assert.notEqual(entryPath(e),entryPath(b));const result=compileEntries([b,e]);assert.deepEqual(result.skills.map(x=>x.id),['author/a','author/b']);assert.equal(result.index.length,2);assert.equal(result.agents.length,0);});
test('version history survives and duplicate identity is rejected',()=>{const newer={...e,version:'1.0.1'};assert.notEqual(entryPath(e),entryPath(newer));assert.equal(compileEntries([e,newer]).skills.length,2);assert.throws(()=>compileEntries([e,{...e,name:'Changed'}]),/Duplicate entry/);});
