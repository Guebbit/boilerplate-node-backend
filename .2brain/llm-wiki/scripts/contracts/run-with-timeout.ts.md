---
source: scripts/contracts/run-with-timeout.ts
source_sha256: 88a12d1a3fc8f83f0da7a99cc347531bfaf1c67ea5a9ae2bd82b898db95808e0
context_sha256: dfa3d0d8770c71adb2e091c0ac04e1785d560a5ac232ace7a125de98bf824074
generated_at: 2026-11-22T02:00:15.393750+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/run-with-timeout.ts

## Purpose
A small wrapper around Node's `execFileSync` that enforces a timeout on nested commands. If a child process hangs, it is killed and a descriptive `CommandTimeoutError` is thrown. A hung child therefore fails the hook instead of freezing it.

## Key elements
- `COMMAND_TIMEOUT_MS`: default timeout of 300,000 ms (5 minutes). The comment calls this generous for a bundle build.
- `CommandTimeoutError`: an `Error` subclass thrown when a command outlives its timeout.
- `runWithTimeout(command, arguments_, options?, timeoutMs?)`: runs the command synchronously and returns `void`.
  - It spreads the caller's `ExecFileSyncOptions` and then sets `timeout` and `killSignal: 'SIGKILL'`, so these two values override any caller-supplied ones.
  - If the error has `code === 'ETIMEDOUT'`, it throws `CommandTimeoutError`. The message names the full command line and the timeout, and the original error is attached as `cause`.
  - Any other error is rethrown unchanged.

## Relationships
- `scripts/contracts/check-asyncapi-breaking.ts` is a neighbor in the dependency graph. This file's own comments describe nested commands such as a bundle build, which fits this role. The file content doesn't show how that script calls it.
- `tests/unit/scripts/contracts/run-with-timeout.test.ts` is the unit test for this module.
- `src/infrastructure/adapters/logger.ts` is listed as a neighbor, but this file doesn't import or use it.

## Notes
- The timeout check is duck-typed (`typeof error === 'object'`, `'code' in error`) rather than using `instanceof Error`. Under jest's vm sandbox, errors from `child_process` come from another realm, so `instanceof` gives wrong results.
- Because `SIGKILL` is used, the child gets no chance to clean up.
- The call is synchronous and blocks the event loop for up to `timeoutMs`.
