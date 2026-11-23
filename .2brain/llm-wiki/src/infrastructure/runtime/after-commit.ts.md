---
source: src/infrastructure/runtime/after-commit.ts
source_sha256: 56e202df15f6e24430f52d92d462df5192759491e04e5c44b31f73b59069a8be
context_sha256: 7c69f961bec6c2a8d9729fb7826f196a5caa1350b43c502dd00720757648ceb6
generated_at: 2026-11-22T03:05:29.397318+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/after-commit.ts

## Purpose
Provides a helper for work that follows a committed write, such as an audit row, an image hand-off, or a file removal. The write has already succeeded, so a failure in these steps is logged and swallowed instead of becoming an error response.

## Key elements
- `afterCommit<T>(step, run, fallback, fields = {})`: the only export. It runs `run`, which may be sync or async, and returns a `Promise<T>`.
  - On success it resolves with whatever `run` returned.
  - On failure it calls `logger.error` with the message `Post-commit step failed: ${step}.`, plus the `fields` and the `error`. It then resolves with `fallback`.
  - `step` is the label used in the log line.
  - `fields` holds ids that make the log line findable, e.g. `{ userId }`.
  - `fallback` is the value the caller would otherwise have received.

## Relationships
- Depends on `src/infrastructure/adapters/logger.ts` (`logger`) to report failures.
- The graph lists `src/modules/example/services/cover.ts`, `src/modules/products/services/crud.ts` and `src/modules/users/services/image.ts` as neighbors. They are presumably the callers that wrap their post-commit steps with it. The file itself does not show this.

## Notes
- It never rejects. A synchronous throw inside `run` is also caught, because `run` is invoked inside `Promise.resolve().then(...)`.
- Each call is independent, so one failed step does not stop the next.
- A failure is only logged, so callers cannot tell a failed step from a successful one that returned the same value as `fallback`.
