# Lilka Marketplace

This public repository is a **reference-only catalog**. Agent prompts, skills, themes, plugins, tools and other executable package files belong to the publisher's repository. Official packages live in [Lilka-Tech/lilka-packages](https://github.com/Lilka-Tech/lilka-packages); their original history and upstream licenses are preserved there.

## Publishing contract

Submit a pull request updating `catalog/index.json` and the corresponding typed projection (`agents.json`, `agencies.json`, `skills.json`, or `appearances.json`). Plugin/tool/toolPack entries currently appear in the full index only. All files use `schemaVersion: 2` and `entries` arrays. Existing versions are immutable: publish updates as a new package version, full commit SHA and digest.

An entry contains `id`, `name`, `type`, `version`, `publishedAt`, `digest` and `source: { kind: "github", owner, repo, ref, path, format: "auto" }`. Optional description/tags/license/downloads/pluginFormat are metadata only. `ref` is a full immutable commit SHA. `path` points to the publisher directory containing `package.json`; `digest` is SHA-256 of `JSON.stringify(JSON.parse(packageBytes))`, prefixed `sha256:`. Tools and tool packs recursively sort object keys (localeCompare), preserving array order, before this JSON digest. Native plugins instead use the complete staged file tree digest: relative path, NUL, raw bytes, NUL, in localeCompare path order, excluding .git. Their source directory contains .codex-plugin/plugin.json or .claude-plugin/plugin.json; package.json is not required. Payload type and version (or semver for existing Lilka export envelopes) must match. Catalog entries must never embed files, prompts, agent/agency configuration or system behaviors.

Run `npm test` and `npm run validate`. Validation checks metadata boundaries, cross-index consistency, immutable references and actual publisher package bytes without executing them. Current clients must support catalog V2 and publisher package imports; V1 package history remains available by old immutable SHA for installed provenance.

## Signed publication and renewal

The protected `marketplace-production` workflow uses the existing GitHub App and pinned Ed25519 key. Merging an approved catalog PR automatically triggers protected publication through the pull_request closed event; unmerged closures do not publish. **Publish signed marketplace metadata** is also available for manual recovery. Daily scheduled renewal keeps the seven-day timestamp current, including when no package changes occur. Publication is serialized, versions increase monotonically, and publisher source SHAs never change during renewal. A different signing key is rejected; key rotation requires separate reviewed client trust changes. No protection or secret is disabled.

Current catalogs and signed metadata are committed atomically by the publication workflow. A catalog proposal merge can briefly precede refreshed signatures; clients must fail closed or use their previously verified cache until publication finishes. CI validates proposals; it does not grant publisher execution permissions.
