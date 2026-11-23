---
source: src/infrastructure/runtime/settle.ts
source_sha256: 8e8ce594d4dc166b02b6a6fe05c71ebc25b129e5e88cb7cd1ce7b826a16c9379
context_sha256: ccbb7d8ead74aff45d57eb06af30c2bec951a2b2bcc19c9c9e51b0c2ddf23c21
generated_at: 2026-11-22T03:07:37.834187+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/settle.ts

## Purpose
Provides a single helper for waiting out work that is still in flight at shutdown, with a time ceiling. It is shared by every adapter that must not exit mid-task (queue handlers, PDF renders), so hung work cannot block shutdown indefinitely.

## Key elements
- `settleWithin(pending, timeoutMs)`: takes a read-only set of promises and a timeout in milliseconds. It returns a `Promise<void>` that resolves when all the promises have settled or the timeout elapses, whichever comes first. It never rejects.
  - If `pending` is empty, it resolves immediately and creates no timer.
  - Otherwise it races `Promise.allSettled(pending)` against a timeout promise. Rejections in `pending` are absorbed.
  - The timer is `unref()`'d so it never keeps the process alive on its own. It is cleared with `clearTimeout` in `finally`.

## Relationships
The neighbor list does not include the file's contents, so the callers are inferred from the module doc and the graph. The doc names queue handlers and PDF renders as the intended users. Those correspond to `src/infrastructure/adapters/queue.ts` and `src/infrastructure/adapters/pdf.ts`. The other neighbors (`job-drain.ts`, `process-boot.ts`, `provider-registry.ts`, `idempotency.ts`, `export.ts`) are related through the dependency graph, but nothing in this file shows how they interact with it.

## Notes
- The set is read once, at call time. Promises added to the caller's set afterwards are not waited on.
- Hitting the timeout is not signalled. The returned promise resolves the same way in both cases, so callers cannot tell "all settled" from "timed out".
- The timed-out work is not cancelled. It keeps running and is simply no longer awaited.
