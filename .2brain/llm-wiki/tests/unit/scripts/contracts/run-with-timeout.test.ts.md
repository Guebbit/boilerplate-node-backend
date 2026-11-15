---
source: tests/unit/scripts/contracts/run-with-timeout.test.ts
sha256: 3fb509edaa9662cb4be1a369748e353d31a35ad6e06d8c4efc7467b21fa9b66b
generated_at: 2026-11-15T00:25:50.975623+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/run-with-timeout.test.ts

## Purpose

Unit tests for the `runWithTimeout` helper, verifying that it enforces a deadline on child processes and that it does not alter non-timeout failures.

## Key elements

- **`describe('runWithTimeout')`** – Jest suite containing two focused cases.
- **"kills a command that never exits and names it in the error"** – Spawns `node -e 'setInterval(…)'` with a 300 ms timeout; asserts the thrown error is a `CommandTimeoutError` and that its message includes the command string and the timeout value.
- **"rethrows a non-timeout failure untouched"** – Spawns `node -e 'process.exit(3)'` with a generous 10 s timeout; asserts the original `Command failed` error propagates unchanged.

## Relationships

- **`scripts/contracts/run-with-timeout.ts`** – The sole subject under test. This file imports `runWithTimeout` and the `CommandTimeoutError` class from it and exercises both the timeout-kill path and the passthrough-failure path.

## Notes

- The "never exits" case uses a real `node` subprocess with `setInterval`, so the test depends on Node being on the PATH and is inherently timing-sensitive (300 ms window). CI slowness could cause flakes if the spawn itself exceeds the timeout.
- The non-timeout case deliberately sets a 10 s timeout so the `exit(3)` path completes well before the deadline, isolating the passthrough behavior.
- Error-message assertions are regex-based (`/node -e setInterval.*300 ms/`), so they are coupled to the exact formatting chosen in `run-with-timeout.ts`; refactoring that format will break these tests.
