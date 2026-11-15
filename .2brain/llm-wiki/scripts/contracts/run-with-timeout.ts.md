---
source: scripts/contracts/run-with-timeout.ts
sha256: afb91942f2ae5626ecb6efede11f369eae391995efc98d3dccfcc5e083be4090
generated_at: 2026-11-14T17:29:18.251616+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/run-with-timeout.ts

## Purpose

Provides a thin wrapper around Node's `execFileSync` that enforces a hard wall-clock timeout on a child process. When the timeout expires the child is killed with `SIGKILL` and a dedicated `CommandTimeoutError` is thrown, so callers in the contract-checking pipeline can distinguish "command hung" from "command failed" without parsing generic `ETIMEDOUT` strings.

## Key elements

- **`COMMAND_TIMEOUT_MS`** (const, `300_000`) — default timeout (5 min). Generous for a bundle build; short enough to fail a pre-commit hook rather than freeze it.
- **`CommandTimeoutError`** (class extends `Error`) — thrown when a command exceeds its timeout. The message embeds the full command line and the timeout value; the original `ETIMEDOUT` error is attached as `cause`.
- **`runWithTimeout(command, arguments_, options?, timeoutMs?)`** — the sole function export. Spawns `command` synchronously via `execFileSync` with `timeout` and `killSignal: 'SIGKILL'`. On timeout it throws `CommandTimeoutError`; any other error is rethrown unchanged.

## Relationships

- **`tests/unit/scripts/contracts/run-with-timeout.test.ts`** — unit-test suite for this module; exercises the happy path, the timeout path, and the pass-through of non-timeout errors.
- **`scripts/contracts/check-asyncapi-breaking.ts`** — sibling contract script in the same `scripts/contracts/` directory; consumes `runWithTimeout` to execute external checks under the shared timeout contract.

## Notes

- The timeout detection is **duck-typed** (`error.code === 'ETIMEDOUT'`) rather than `instanceof Error`. This is intentional: under Jest's VM sandbox the `child_process` error originates from a different realm, so `instanceof` checks against the host `Error` class return `false`. Do not "fix" this to `instanceof` without removing the Jest sandbox first.
- `killSignal` is hardcoded to `SIGKILL`; the caller cannot override it through the `options` parameter (it is spread after the user options).
- The parameter is named `arguments_` (trailing underscore) to avoid shadowing the non-standard `arguments` object.
