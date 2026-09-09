import { createHash } from 'node:crypto';
export const TYPES = ['agent', 'agency', 'skill', 'theme', 'iconTheme', 'plugin', 'tool', 'toolPack'];
export const canonicalDigest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
export function validateEntry(entry) {
  const allowed = ['id','name','description','type','source','digest','version','downloads','tags','publishedAt','pluginFormat','license'];
  if (Object.keys(entry).some((key) => !allowed.includes(key))) throw new Error(`Payload or unknown metadata field in ${entry.id}`);
  for (const key of ['id','name','version']) if (typeof entry[key] !== 'string' || !entry[key].trim()) throw new Error(`Missing ${key}`);
  if (!TYPES.includes(entry.type) || !/^sha256:[a-f0-9]{64}$/.test(entry.digest)) throw new Error(`Invalid type/digest: ${entry.id}`);
  const source = entry.source;
  if (!source || Object.keys(source).some((key) => !['kind','owner','repo','ref','path','format'].includes(key))) throw new Error(`Invalid source: ${entry.id}`);
  if (source.kind !== 'github' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(source.owner) || !/^[A-Za-z0-9_.-]+$/.test(source.repo)) throw new Error('Invalid GitHub publisher');
  if (`${source.owner}/${source.repo}`.toLowerCase() === 'lilka-tech/lilka-marketplace') throw new Error('The catalog cannot host package payloads');
  if (!/^[a-f0-9]{40}$/.test(source.ref)) throw new Error('Publisher ref must be an immutable full commit SHA');
  if (typeof source.path !== 'string' || !source.path || source.path.startsWith('/') || source.path.includes('\\') || source.path.split('/').some((part) => ['..',''].includes(part)) || /[?#%\x00-\x1f]/.test(source.path)) throw new Error('Unsafe publisher path');
  if (!['auto','claude','codex'].includes(source.format)) throw new Error('Invalid format');
  if (!Number.isFinite(Date.parse(entry.publishedAt))) throw new Error('Invalid publication date');
  if (entry.tags && (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== 'string'))) throw new Error('Invalid tags');
  return entry;
}
export async function verifyPayload(entry, fetcher = fetch) {
  validateEntry(entry);
  if (entry.type === 'plugin') return verifyPlugin(entry, fetcher);
  const s = entry.source;
  const path = s.path === '.' ? 'package.json' : `${s.path}/package.json`;
  const url = `https://raw.githubusercontent.com/${s.owner}/${s.repo}/${s.ref}/${path}`;
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error(`Publisher payload unavailable: ${entry.id} HTTP ${response.status}`);
  const body = await response.text();
  if (Buffer.byteLength(body) > 10 * 1024 * 1024) throw new Error('Publisher package exceeds 10 MiB');
  const payload = JSON.parse(body);
  if (payload.type !== entry.type || (payload.version ?? payload.semver) !== entry.version) throw new Error(`Publisher identity mismatch: ${entry.id}`);
  if (canonicalDigest(['tool','toolPack'].includes(entry.type) ? canonicalToolValue(payload) : payload) !== entry.digest) throw new Error(`Publisher digest mismatch: ${entry.id}`);
  return payload;
}
export function canonicalToolValue(value) {
  if (Array.isArray(value)) return value.map(canonicalToolValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonicalToolValue(item)]));
}
export async function verifyPlugin(entry, fetcher = fetch) {
  const s=entry.source;
  const headers = process.env.GITHUB_TOKEN ? {Authorization:`Bearer ${process.env.GITHUB_TOKEN}`} : {};
  const treeResponse=await fetcher(`https://api.github.com/repos/${s.owner}/${s.repo}/git/trees/${s.ref}?recursive=1`,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!treeResponse.ok)throw new Error(`Plugin tree unavailable HTTP ${treeResponse.status}`);
  const tree=await treeResponse.json();if(tree.truncated)throw new Error('Truncated plugin tree');
  const prefix=s.path==='.'?'':`${s.path}/`;
  const files=(tree.tree??[]).filter(item=>item.path.startsWith(prefix)&&item.type!=='tree').map(item=>({...item,path:item.path.slice(prefix.length)})).filter(item=>!item.path.split('/').some(segment=>segment.toLowerCase()==='.git')).sort((a,b)=>a.path.localeCompare(b.path));
  if(!files.length||files.length>512)throw new Error('Invalid plugin file count');
  const hash=createHash('sha256');let total=0;let manifest;
  const format=entry.pluginFormat??s.format;
  const manifestPath=format==='claude'?'.claude-plugin/plugin.json':'.codex-plugin/plugin.json';
  for(const file of files){
    if(!['100644','100755'].includes(file.mode)||file.type!=='blob'||file.path.split('/').includes('..'))throw new Error('Plugin must contain regular safe files only');
    if(file.size>8*1024*1024)throw new Error('Plugin file too large');
    const response=await fetcher(`https://raw.githubusercontent.com/${s.owner}/${s.repo}/${s.ref}/${prefix}${file.path}`,{signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!response.ok)throw new Error('Plugin file unavailable');const bytes=Buffer.from(await response.arrayBuffer());total+=bytes.length;
    if(bytes.length>8*1024*1024||total>64*1024*1024)throw new Error('Plugin size limit exceeded');
    hash.update(file.path);hash.update('\0');hash.update(bytes);hash.update('\0');
    if(file.path===manifestPath)manifest=JSON.parse(bytes.toString('utf8'));
  }
  if(!manifest||manifest.version!==entry.version)throw new Error('Plugin manifest/version mismatch');
  if(`sha256:${hash.digest('hex')}`!==entry.digest)throw new Error('Plugin tree digest mismatch');
  return manifest;
}
