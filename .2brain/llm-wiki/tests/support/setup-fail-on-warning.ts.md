---
source: tests/support/setup-fail-on-warning.ts
sha256: 240102009cb3452a358b5d49283bb49065e1b5ae343027a6b11ecefda996e974
generated_at: 2026-11-08T09:59:59.339715+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-fail-on-warning.ts

## Purpose

A Jest `setupFilesAfterEach` entry that turns any undeclared `console.warn`, `console.error`, or `process` `'warning'` event into a test failure. Its goal is to surface deprecations, leaked listeners, and driver warnings on the very run that introduces them rather than letting them scroll past in a green log.

## Key elements

- **`flushPendingWarnings`** — Returns a promise that resolves after one real `process.nextTick`. Used to give Node time to deliver warnings that were already queued so they are attributed to the correct test case.
- **`beforeEach` hook** — Flushes any in-flight warnings from the previous case, then calls `warnings.start()` (from `expect-warning.ts`) to begin tracking with an empty slate.
- **`afterEach` hook** — Flushes in-flight warnings again, then calls `warnings.finish()`, which asserts that every captured warning was previously declared as expected; otherwise the case fails.
- **`nextTick` capture** — Grabs `process.nextTick` at module load time so the flush is immune to fake-timer replacements applied inside test files.

## Relationships

- **`tests/support/expect-warning.ts`** — Provides the `warnings` object (`start`, `finish`) that tracks which warnings a test has declared as expected. This file drives the lifecycle (start/finish) around each test case.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — A test file that runs under this setup; any warning it emits (transitively through the code under test) will cause a failure unless declared via `expect-warning.ts`.

## Notes

- Must be registered via Jest's `setupFilesAfterEach` (or equivalent) so that `beforeEach`/`afterEach` globals are available at evaluation time.
- The `nextTick` capture is intentional: if a test installs fake timers *after* this module loads, the flush still uses the real scheduler. Do not replace the captured reference.
- This file handles only the *enforcement* side. Declaring that a specific warning is expected is the job of `expect-warning.ts`.
