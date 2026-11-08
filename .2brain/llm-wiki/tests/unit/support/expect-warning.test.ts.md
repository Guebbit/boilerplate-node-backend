---
source: tests/unit/support/expect-warning.test.ts
sha256: 6bc8d33be9ed59f5664c0fffdf3d639a320a684b3f4bdff4109f871b1331a6f2
generated_at: 2026-11-08T10:44:18.224420+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/expect-warning.test.ts

## Purpose

Unit tests for the warning-watcher module (`tests/support/expect-warning.ts`). Verifies that `createWarningWatcher` correctly detects undeclared warnings, honors declared ones, cleans up after itself, and that the `expectWarning` helper integrates with both the real process emitter and the setup file's shared watcher.

## Key elements

- **`watched()`** (local helper) — Factory that builds an isolated test environment: a pair of `jest.fn()` spies for `console.warn`/`error`, a private `on/off/emit` emitter for `'warning'` events, and a started `createWarningWatcher` wrapping both. Returns all pieces so assertions can inspect spies, listeners, and the watcher.
- **`describe('createWarningWatcher')`** — Eight cases covering: failure on undeclared `console.warn`/`console.error`/emitted process warning; acceptance of declared warnings (substring and regex); failure on a declaration that never fired; pass-through of calls to the original console functions; restoration of the console and removal of listeners on `finish()`; and reset semantics of `start()`.
- **`describe('the real process')`** — Two cases confirming the watcher hears `process.emitWarning` (both async via `nextTick` and synchronous), using the `expectWarning` helper.
- **`describe('expectWarning')`** — One case confirming that `expectWarning` registers a declaration on the setup file's shared watcher, so a subsequent real `console.warn` in the same case does not fail.

## Relationships

- **`tests/support/expect-warning.ts`** — Imports `createWarningWatcher` and `expectWarning`; this file is the sole consumer under test.
- **Jest global setup** (referenced in comments, not imported) — The setup file installs its own watcher on the real `console` and `process`; the `expectWarning` describe block depends on that shared instance, while the `watched()` factory deliberately avoids it to isolate assertions.

## Notes

- The `watched()` helper uses a *spread-and-replace* pattern: `target` is initially `{ ...original }`, then `createWarningWatcher` overwrites `target.warn`/`target.error` with its own spies. Tests assert the *original* jest.fn spies were called to prove pass-through.
- The "the real process" block intentionally uses `process.emitWarning` (not the fake emitter) and relies on `process.nextTick` to let the async delivery land before the test resolves.
- The `expectWarning` describe block calls `console.warn` directly (with an eslint-disable) because it is testing integration with the harness's shared watcher, not the isolated one from `watched()`.
