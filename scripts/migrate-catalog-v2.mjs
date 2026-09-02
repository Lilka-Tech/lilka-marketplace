import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const catalogs = ['index.json', 'agents.json', 'agencies.json', 'skills.json', 'appearances.json', 'tools.json'];

const toSkillDirectory = (value) => {
  if (!value || value === '.') return '.';
  return value.endsWith('/SKILL.md') ? value.slice(0, -'/SKILL.md'.length) : value.replace(/\/$/, '');
};

const parseGithubRepo = (repository) => {
  const [owner, repo] = String(repository).split('/');
  if (!owner || !repo) throw new Error(`Invalid repository: ${repository}`);
  return { owner, repo };
};

const shouldUseExternalSource = (payload) => {
  const source = payload.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false;
  if (typeof source.repository !== 'string' || !source.repository.includes('/')) return false;
  return source.repository !== 'Lilka-Tech/lilka-marketplace';
};

const migrateEntry = async (entry, catalogCommit) => {
  if (entry.source) return entry;
  const packageFile = join(entry.path, 'package.json');
  const payload = JSON.parse(await readFile(packageFile, 'utf8'));
  let source;
  if (entry.type === 'skill' && shouldUseExternalSource(payload)) {
    const upstream = parseGithubRepo(payload.source.repository);
    source = {
      kind: 'github',
      owner: upstream.owner,
      repo: upstream.repo,
      ref: payload.source.commit || entry.commit || catalogCommit,
      path: toSkillDirectory(payload.source.path),
      format: 'auto',
    };
  } else {
    source = {
      kind: 'github',
      owner: 'Lilka-Tech',
      repo: 'lilka-marketplace',
      ref: entry.commit || catalogCommit,
      path: entry.path,
      format: 'auto',
    };
  }
  const {
    repository,
    path,
    commit,
    archivePath,
    archiveDigest,
    redistributionAttested,
    compatibilityReportVersion,
    ...rest
  } = entry;
  return {
    ...rest,
    source,
    ...(entry.pluginFormat ? { pluginFormat: entry.pluginFormat } : {}),
    ...(entry.license ? { license: entry.license } : {}),
    ...(entry.systemBehaviors ? { systemBehaviors: entry.systemBehaviors } : {}),
  };
};

for (const file of catalogs) {
  const catalogPath = join('catalog', file);
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  if (catalog.schemaVersion === 2) {
    console.log(`catalog/${file} already v2`);
    continue;
  }
  if (catalog.schemaVersion !== 1) throw new Error(`Unsupported schema in catalog/${file}`);
  const migrated = {
    schemaVersion: 2,
    version: catalog.version,
    generatedAt: catalog.generatedAt,
    commit: catalog.commit,
    entries: await Promise.all(catalog.entries.map((entry) => migrateEntry(entry, catalog.commit))),
  };
  await writeFile(catalogPath, `${JSON.stringify(migrated, null, 2)}\n`);
  console.log(`Migrated catalog/${file} to schemaVersion 2 (${migrated.entries.length} entries)`);
}
