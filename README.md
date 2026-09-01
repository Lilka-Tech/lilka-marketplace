# Lilka Marketplace

Git-backed public catalog for Lilka packages. Free packages are proposed through pull requests; the protected publication workflow materializes signed catalog metadata.

Paid package binaries never live in this repository. Only public metadata, immutable digests, prices and compatibility information are published here.
# Tools and tool packs

Public `tool` and `toolPack` packages live under `packages/free/tools` and `packages/free/tool-packs`. Script tools must include readable TypeScript or Python source. Definitions declare schemas, compatibility, capabilities and required secret names, but never secret values. Releases are immutable and reach the signed catalog only through a reviewed pull request and the protected publication workflow.
