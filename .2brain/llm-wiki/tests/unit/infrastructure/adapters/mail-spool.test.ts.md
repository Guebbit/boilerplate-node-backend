---
source: tests/unit/infrastructure/adapters/mail-spool.test.ts
sha256: 565cc98bc50a13490c0e901ae58694375b6ce08b6a12912975beb926339a5529
generated_at: 2026-11-08T10:08:06.542101+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mail-spool.test.ts

## Purpose

Unit tests for the mail-spool adapter, covering the four exported functions (`spoolAttachment`, `resolveSpooled`, `discardSpooled`, `reapSpooled`). The suite places particular emphasis on the path-traversal resistance of `resolveSpooled` and `discardSpooled`, ensuring that a malformed or attacker-supplied key can never resolve to a path outside the spool root.

## Key elements

- **`beforeEach` / `afterEach` hooks** — Create a fresh `mkdtemp` directory per test, point `NODE_MAIL_SPOOL_PATH` at it via `setEnvironment`, then remove it. No test shares spool state.
- **`describe('spoolAttachment')`** — Verifies that bytes are written under the spool root, the returned key matches `^[0-9a-f]{32}\.pdf$`, the directory is created lazily, and identical payloads still receive distinct keys.
- **`describe('resolveSpooled')`** — Positive case: a valid key maps to `<spoolRoot>/<key>`. Parameterised negative cases (`it.each`) confirm that traversal segments, absolute paths, missing extensions, embedded slashes, and wrong-case extensions all resolve to `undefined`.
- **`describe('discardSpooled')`** — Confirms deletion, idempotent no-op for unknown keys, no-throw for unresolvable keys, and that a file physically outside the spool root survives a `../`-shaped discard attempt.
- **`describe('reapSpooled')`** — Uses `utimes` to backdate a file's mtime, then asserts that only the stale file is removed (returns count `1`) and a fresh file remains. Also verifies a clean `0` return when the spool directory was never created.

## Relationships

- **`src/infrastructure/adapters/mail-spool.ts`** — The module under test; all four exported functions are imported and exercised here.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used in `beforeEach` to inject `NODE_MAIL_SPOOL_PATH` into the process environment so the adapter reads the per-test temp directory.

## Notes

- The file-header comment explicitly frames `resolveSpooled` as the "security-relevant half" of the module and draws a parallel to `image-store.ts`'s `resolveUnderPublicRoot` guard. When modifying `mail-spool.ts`, mirror any new traversal vectors into the `it.each` table in `resolveSpooled`.
- The "file outside the spool root" test in `discardSpooled` creates a *second* temp dir (`mail-spool-outside-`) and cleans it up manually in-test (not via `afterEach`) — a deliberate one-off since it exists to prove the guard is load-bearing, not merely a type check.
- Key format is hard-coded as a 32-hex-digit string plus extension; if the hashing algorithm or extension set in the adapter changes, both the positive regex assertion and the negative-case strings will need updating.
