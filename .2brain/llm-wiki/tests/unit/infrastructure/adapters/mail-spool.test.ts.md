---
source: tests/unit/infrastructure/adapters/mail-spool.test.ts
sha256: 45924f939d9c0f9f033b079c53260eb7dce1dc204b84efe09188238e252d5045
generated_at: 2026-09-23T20:18:23.611099+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mail-spool.test.ts

## Purpose

Unit tests for the mail-spool adapter. The central concern is verifying that `resolveSpooled` acts as the single choke-point where a caller-supplied key is turned into a filesystem path, and that any traversal, absolute-path, or otherwise malformed key resolves to `undefined` rather than a path outside the spool root. Remaining tests cover the basic write/read/discard/reap lifecycle.

## Key elements

- **`beforeEach` / `afterEach`** — Create a per-test temp directory via `mkdtemp`, point `process.env.NODE_MAIL_SPOOL_PATH` at it, and restore the original env value on teardown.
- **`describe('spoolAttachment')`** — Verifies bytes are written under the spool root, the key matches `^[\da-f]{32}\.pdf$`, the directory is created on demand, and identical payloads still yield distinct keys.
- **`describe('resolveSpooled')`** — Confirms a valid key maps to `path.join(spoolRoot, key)`, then uses `it.each` to assert `undefined` for traversal (`../../`), absolute paths, missing extension, embedded slashes, and uppercase extensions.
- **`describe('discardSpooled')`** — Checks file deletion, that nonexistent or unresolvable keys resolve without rejecting, and (load-bearing test) that a file physically outside the spool root survives a discard call whose key attempts to name it via `..`.
- **`describe('reapSpooled')`** — Uses `utimes` to age one file past the retention window; asserts only the stale file is deleted and the return count is `1`. Also asserts `0` when the spool directory was never created.

## Relationships

- **`src/infrastructure/adapters/mail-spool.ts`** — The sole import target. The test exercises all four exported functions (`spoolAttachment`, `resolveSpooled`, `discardSpooled`, `reapSpooled`) and relies on the module reading its spool root from `process.env.NODE_MAIL_SPOOL_PATH` rather than a hardcoded path.

## Notes

- The spool root is injected **only** through the `NODE_MAIL_SPOOL_PATH` environment variable; the test saves and restores the prior value (including the `undefined` case) to avoid cross-test pollution.
- The "file outside the spool root survives `discardSpooled`" test exists to prove the traversal guard is enforced at the filesystem level, not merely by a regex/type check in the implementation.
- Key shape is strictly `{32 lowercase hex}.{lowercase ext}`; any deviation (uppercase ext, slash, missing ext) is treated as invalid.
