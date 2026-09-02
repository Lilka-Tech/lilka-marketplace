import { readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';
import { createHash } from 'node:crypto';

const sorted = (value) => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sorted(item)])) : value;
const canonicalDigest = (value, deterministic = false) => `sha256:${createHash('sha256').update(JSON.stringify(deterministic ? sorted(value) : value)).digest('hex')}`;
const validateTool = (tool, refs, key) => {
  if (!/^[a-z0-9][a-z0-9._:/-]*$/.test(tool.ref ?? '')) throw new Error(`Invalid tool ref for ${key}`);
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(tool.runtimeName ?? '')) throw new Error(`Invalid runtimeName for ${key}`);
  if (!tool.inputSchema || typeof tool.inputSchema !== 'object') throw new Error(`Input schema is required for ${key}`);
  if (!tool.executor || !['http', 'mcp', 'composition', 'script'].includes(tool.executor.type)) throw new Error(`Invalid executor for ${key}`);
  if (tool.executor.type === 'composition') {
    const ids = new Set(tool.executor.nodes?.map((node) => node.id) ?? []);
    if (!ids.size || ids.size !== tool.executor.nodes.length) throw new Error(`Invalid composition nodes for ${key}`);
    for (const node of tool.executor.nodes) {
      if (!refs.has(node.toolRef)) throw new Error(`Composition ${key} references tool outside its pack: ${node.toolRef}`);
      if ((node.dependsOn ?? []).some((dependency) => !ids.has(dependency))) throw new Error(`Composition ${key} has an unknown dependency`);
    }
    const visiting = new Set(); const visited = new Set(); const byId = new Map(tool.executor.nodes.map((node) => [node.id, node]));
    const visit = (id) => { if (visiting.has(id)) return false; if (visited.has(id)) return true; visiting.add(id); if ((byId.get(id)?.dependsOn ?? []).some((dep) => !visit(dep))) return false; visiting.delete(id); visited.add(id); return true; };
    if ([...ids].some((id) => !visit(id))) throw new Error(`Composition ${key} contains a cycle`);
  }
  if (tool.executor.type === 'script') {
    if (!['typescript', 'python'].includes(tool.executor.runtime) || !tool.executor.files?.[tool.executor.entrypoint]) throw new Error(`Script source and entrypoint are required for ${key}`);
    for (const path of Object.keys(tool.executor.files)) if (isAbsolute(path) || normalize(path).split(sep).includes('..')) throw new Error(`Unsafe script source path for ${key}: ${path}`);
  }
};

const validateSource = (source, key) => {
  if (source.kind !== 'github') throw new Error(`Unsupported source kind for ${key}`);
  if (!source.owner || !source.repo || !source.ref) throw new Error(`Incomplete github source for ${key}`);
  if (isAbsolute(source.path) || normalize(source.path ?? '.').split(sep).includes('..')) throw new Error(`Invalid source path for ${key}`);
  if (String(source.path ?? '').endsWith('/SKILL.md') || source.path === 'SKILL.md') throw new Error(`Source path must be a directory for ${key}`);
};

const validateV1Entry = async (entry) => {
  const key = `${entry.id}@${entry.version}`;
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
  if (canonicalDigest(payload, payload.type === 'tool' || payload.type === 'toolPack') !== entry.digest) throw new Error(`Package digest mismatch for ${key}`);
  if (payload.type === 'tool' || payload.type === 'toolPack') {
    if (!payload.permissions || !payload.compatibility) throw new Error(`Tool permissions and compatibility are required for ${key}`);
    if (payload.type === 'tool') {
      if (payload.executor?.type === 'composition') throw new Error(`Standalone public compositions are forbidden for ${key}`);
      validateTool(payload, new Set([payload.ref]), key);
    }
    if (payload.type === 'toolPack') {
      if (!Array.isArray(payload.tools) || !payload.tools.length) throw new Error(`Invalid tool pack for ${key}`);
      const refs = new Set(payload.tools.map((tool) => tool.ref));
      if (refs.size !== payload.tools.length) throw new Error(`Duplicate refs in ${key}`);
      for (const tool of payload.tools) validateTool(tool, refs, `${key}:${tool.ref}`);
    }
  }
};

const validateV2Entry = async (entry) => {
  const key = `${entry.id}@${entry.version}`;
  if (!/^sha256:[a-f0-9]{64}$/.test(entry.digest)) throw new Error(`Invalid digest for ${key}`);
  validateSource(entry.source, key);
  const isMonorepo = entry.source.owner === 'Lilka-Tech' && entry.source.repo === 'lilka-marketplace';
  if (!isMonorepo) {
    if (entry.type === 'plugin' && !entry.pluginFormat && entry.source.format === 'auto') throw new Error(`pluginFormat is required for ${key}`);
    return;
  }
  const packagePath = entry.source.path;
  if (!packagePath.startsWith('packages/free/')) throw new Error(`Invalid monorepo package path for ${key}`);
  const packageFile = join(packagePath, 'package.json');
  const payload = JSON.parse(await readFile(packageFile, 'utf8'));
  const packageVersion = payload.version ?? payload.semver;
  if (payload.type !== entry.type || packageVersion !== entry.version) {
    throw new Error(`Package identity mismatch for ${key}`);
  }
  if (canonicalDigest(payload, payload.type === 'tool' || payload.type === 'toolPack') !== entry.digest) throw new Error(`Package digest mismatch for ${key}`);
  if (payload.type === 'tool' || payload.type === 'toolPack') {
    if (!payload.permissions || !payload.compatibility) throw new Error(`Tool permissions and compatibility are required for ${key}`);
    if (payload.type === 'tool') {
      if (payload.executor?.type === 'composition') throw new Error(`Standalone public compositions are forbidden for ${key}`);
      validateTool(payload, new Set([payload.ref]), key);
    }
    if (payload.type === 'toolPack') {
      if (!Array.isArray(payload.tools) || !payload.tools.length) throw new Error(`Invalid tool pack for ${key}`);
      const refs = new Set(payload.tools.map((tool) => tool.ref));
      if (refs.size !== payload.tools.length) throw new Error(`Duplicate refs in ${key}`);
      for (const tool of payload.tools) validateTool(tool, refs, `${key}:${tool.ref}`);
    }
  }
};

const catalogs = ['index.json', 'agents.json', 'agencies.json', 'skills.json', 'appearances.json', 'tools.json'];
for (const file of catalogs) {
  const value = JSON.parse(await readFile(join('catalog', file), 'utf8'));
  if (![1, 2].includes(value.schemaVersion) || !Array.isArray(value.entries)) throw new Error(`Invalid catalog/${file}`);
  const ids = new Set();
  for (const entry of value.entries) {
    const key = `${entry.id}@${entry.version}`;
    if (ids.has(key)) throw new Error(`Duplicate entry ${key}`);
    if (value.schemaVersion === 1) await validateV1Entry(entry);
    else await validateV2Entry(entry);
    ids.add(key);
  }
}
const forbidden = /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|(?:api[_-]?key|password|token)\s*[:=]\s*["'][^"'$]{8,})/i;
for (const directory of ['catalog', 'packages', 'policies', 'schemas']) for (const name of await readdir(directory, { recursive: true })) {
  const target = join(directory, name.toString());
  const bytes = await readFile(target).catch(() => Buffer.alloc(0));
  if (bytes.includes(0)) throw new Error(`Binary file is forbidden: ${target}`);
  const content = bytes.toString('utf8');
  if (forbidden.test(content)) throw new Error(`Potential secret in ${target}`);
  if (/lock(?:\.json|\.yaml|\.lock)$/.test(target) && /(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(content))
    throw new Error(`Private dependency URL in ${target}`);
}
