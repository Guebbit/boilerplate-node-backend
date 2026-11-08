---
source: src/infrastructure/runtime/settle.ts
sha256: e853d606edd33f33a2020fd676c0f0ca0143ef7200b35016b982593e5f696321
generated_at: 2026-11-08T03:48:06.564637+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/settle.ts

## Purpose

Provides a single shutdown utility that waits for in-flight work to finish, bounded by a timeout. Every adapter that must not exit mid-task (queue handlers, PDF renders) uses this so a hung task can't hold the process open indefinitely.

## Key elements

- **`settleWithin(pending: ReadonlySet<Promise<unknown>>, timeoutMs: number): Promise<void>`** — the sole export. Resolves when *all* promises in `pending` have settled (via `Promise.allSettled`) **or** when `timeoutMs` elapses, whichever comes first. Never rejects. Clears its timer in a `.finally` so no dangling handle remains.

## Relationships

- **`src/infrastructure/adapters/queue.ts`** — consumer; passes its live set of in-flight queue-handler promises into `settleWithin` during shutdown.
- **`src/infrastructure/adapters/pdf.ts`** — consumer; passes in-flight render promises the same way.
- **`src/app.ts`** — the shutdown orchestrator that ultimately triggers the settle call for the adapters above.

## Notes

- The timer created internally is **`.unref()`'d**, so it never prevents the Node process from exiting on its own.
- `Promise.allSettled` is used deliberately: individual rejections in the set are swallowed (the function resolves regardless). Callers that need to *observe* a rejection must track it separately.
- The caller must snapshot its live set **before** passing it in; the function reads the set once and does not observe additions made after the call.
- `pending.size === 0` short-circuits immediately with `Promise.resolve()`, so an empty set costs nothing.
