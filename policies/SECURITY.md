# Marketplace security policy

Executable packages require explicit permissions, immutable SHA-256 digests and human review. Never include credentials, cookies, private URLs, absolute paths or symlinks in a package.
# Executable tools

Tool submissions are executable content. Reviewers must reject credentials, binary executables, symlinks, path escapes, vendored dependencies, private lockfile URLs, undeclared network/filesystem/subprocess capabilities, or script packages without readable source. Security suspension preserves history while preventing new execution and downloads.
