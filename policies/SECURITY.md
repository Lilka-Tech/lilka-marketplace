# Marketplace security policy

Executable packages require explicit permissions, immutable SHA-256 digests and human review. Never include credentials, cookies, private URLs, absolute paths or symlinks in a package.

The catalog never stores package payloads. Every source is a public publisher-owned GitHub repository at a full immutable commit SHA. Metadata validation fetches bytes read-only, validates type-specific digests, rejects path escapes and plugin symlinks, and never executes publisher code. Signed timestamp expiration remains enforced; daily protected renewal prevents stale metadata. Catalog signatures establish catalog integrity, not an execution grant for installed packages.
