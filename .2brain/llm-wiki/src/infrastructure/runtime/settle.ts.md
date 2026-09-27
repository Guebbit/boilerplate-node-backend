---
source: src/infrastructure/runtime/settle.ts
sha256: e853d606edd33f33a2020fd676c0f0ca0143ef7200b35016b982593e5f696321
generated_at: 2026-09-27T14:16:00.139157+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/settle.ts

## Purpose

Provides a single shared utility for adapters that must drain in-flight work before process shutdown (queue handlers, PDF renders). It guarantees shutdown is never held hostage by hung tasks by racing "all work settled" against a hard deadline.

## Key elements

- **`settleWithin(pending, timeoutMs): Promise<void>`** — Resolves once every promise in `pending` has settled *or* `timeoutMs` elapses, whichever is first.
  - Reads the `ReadonlySet` once at call time (caller owns the live set).
  - Short-circuits to `Promise.resolve()` when the set is empty.
  - Uses `Promise.allSettled` (so individual rejections don't propagate) and `Promise.race` against an `unref`'d `setTimeout` deadline.
  - Cleans up the timer via `.finally(clearTimeout)` regardless of which side wins.
  - Never rejects.

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — Consumes `settleWithin` to drain in-flight queue-handling tasks during graceful shutdown.
- **`src/infrastructure/adapters/pdf.ts`** — Consumes `settleWithin` to wait for active PDF render jobs before the process exits.

## Notes

- The timeout timer is `.unref()`'d so it cannot, on its own, keep the Node.js event loop alive. This matters because the whole point is to *exit* after the deadline — without `unref`, the pending timer would prevent the process from actually terminating.
- `settleWithin` never rejects; if a promise in `pending` rejects, `allSettled` simply records it. Callers that need to inspect per-task failure must inspect their own promise objects separately.
- The `pending` set is read once at the call site; promises added to the caller's set *after* `settleWithin` is invoked are not waited on.
