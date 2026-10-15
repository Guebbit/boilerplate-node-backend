---
source: tests/unit/infrastructure/adapters/mail-spool.test.ts
sha256: 565cc98bc50a13490c0e901ae58694375b6ce08b6a12912975beb926339a5529
generated_at: 2026-10-15T13:07:18.893387+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mail-spool.test.ts

## Purpose

Unit tests for the mail-spool adapter (`src/infrastructure/adapters/mail-spool.ts`). The focus is on the security contract of `resolveSpooled` (path-traversal / absolute-path rejection) and the fail-safe behavior of `discardSpooled` (never throws, never escapes the spool root). Also covers key minting, idempotent reaping, and spool-directory auto-creation.

## Key elements

- **`beforeEach` / `afterEach`** — Create a fresh `mkdtemp` directory, inject it as `NODE_MAIL_SPOOL_PATH` via `setEnvironment`, and recursively remove it after each test.
- **`describe('spoolAttachment')`** — Verifies the returned key matches `/^[\da-f]{32}\.pdf$/`, that the file is readable under the spool root, that the spool directory is created on demand, and that identical bytes still produce distinct keys.
- **`describe('resolveSpooled')`** — Positive: a valid hex+extension key resolves to `path.join(spoolRoot, key)`. Negative (parameterized with `it.each`): traversal segments, absolute paths, missing extensions, embedded slashes, and uppercase extensions all resolve to `undefined`.
- **`describe('discardSpooled')`** — Confirms the file is deleted, that non-existent or unresolvable keys resolve to `undefined` (never reject), and a dedicated "load-bearing" test proving a file outside the spool root survives a `../`-shaped key.
- **`describe('reapSpooled')`** — Stale file (mtime back-dated via `utimes`) is removed while a fresh file survives; returns the count. Also asserts a return of `0` when the spool directory does not exist.

## Relationships

- **`src/infrastructure/adapters/mail-spool.ts`** — The module under test. All four exported functions (`spoolAttachment`, `resolveSpooled`, `discardSpooled`, `reapSpooled`) are imported and exercised here.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used in `beforeEach` to point the adapter at the per-test temp directory via the `NODE_MAIL_SPOOL_PATH` key.

## Notes

- The spool path is set through the environment, not by passing it as an argument. If the adapter reads a different env var or a different default, these tests will silently target the wrong directory.
- Key format is asserted as exactly 32 lowercase hex chars + a dot + the extension. Changing the hash algorithm or length in the adapter will break `spoolAttachment` and `resolveSpooled` tests simultaneously.
- The "leaves a file outside the spool root untouched" test creates a second temp dir *outside* the spool root and cleans it up inline (not via `afterEach`); forgetting that cleanup would leak a directory on test failure.
- `reapSpooled` retention is controlled by an explicit millisecond argument, not a config value, so the test is decoupled from any default retention constant in the adapter.
