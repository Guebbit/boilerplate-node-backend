---
source: src/infrastructure/http/sse.ts
sha256: bc4f240b0eef4fbcbeb1ebb928e68c4e46f045897b071f0e54f5901e6c36c2a2
generated_at: 2026-11-14T18:06:57.578545+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/sse.ts

## Purpose

Shared infrastructure for opening and tearing down Server-Sent Events streams. Every SSE endpoint in the codebase goes through `openSseStream`, which handles the cross-cutting concerns (admission control, required headers, periodic access re-verification, and idempotent teardown). What each stream actually *sends* (event frames, heartbeats) and what it *tracks* (its own connection registry) stays with the owning module.

## Key elements

- **`openSseStream(response, userId, reverify)`** — Opens an SSE stream on an Express `Response`. Checks admission limits, sets `text/event-stream` + `no-store, no-transform` headers, flushes them, then starts a 30 s interval that calls `reverify()`. Returns an `SseStream` handle or `undefined` if the request was refused (429/503 already sent).
- **`SseStream` interface** — The handle returned to the caller. Exposes a single `onClose(cleanup)` method so the owning module can register its own one-time teardown (clear timers, remove from its registry).
- **`admit(response, userId)`** *(internal)* — Atomically checks the node-wide and per-user stream caps. On refusal, sends the appropriate error response and returns `false`; on success, increments the counters and returns `true`.
- **`release(userId)`** *(internal)* — Decrement the per-user count (deleting the key at zero) and the node-wide total. Called exactly once via the idempotent `teardown`.
- **`REVERIFY_INTERVAL_MS`** — `30_000`. How often an open stream re-proves the caller still holds a valid credential.
- **`PER_USER_RETRY_AFTER_SECONDS`** — `30`. The `Retry-After` value sent with a 429 per-user refusal.
- **`openPerUser` / `openTotal`** *(module-level state)* — In-process counters tracking how many streams each user holds and the total across all users.

## Relationships

- **`src/infrastructure/http/config.ts`** — Calls `sseConfig()` to read `NODE_SSE_MAX_STREAMS` and `NODE_SSE_MAX_STREAMS_PER_USER` limits at admission time.
- **`src/infrastructure/http/errors.ts`** — Uses `rejectServiceUnavailable` to send the 503 when the node-wide cap is hit.
- **`src/infrastructure/http/response.ts`** — Uses `rejectResponse` and `generateRateLimited` to send the 429 per-user refusal with a structured error body.
- **`src/modules/notifications/services/stream.ts`** — Consumer: opens a notification SSE stream via `openSseStream`, registering its own frame-writing and heartbeat logic through the returned `SseStream` handle.
- **`src/modules/observability/services/stream.ts`** — Consumer: opens an observability SSE stream the same way.
- **`tests/unit/infrastructure/http/sse.test.ts`** — Unit tests covering admission, teardown idempotency, re-verification failure, and header correctness.

## Notes

- `openSseStream` returns `undefined` (not a thrown error) when a cap is refused. The 429/503 is already flushed to the response; the caller **must** return immediately without registering any `onClose` cleanup.
- The `reverify` callback is treated as fail-closed: a rejected promise or a `false` return both end the stream. There is no distinction between "revoked" and "check failed."
- The per-user and node-wide counters are **per-process** in-memory maps. In a multi-instance deployment the effective cap is `NODE_SSE_MAX_STREAMS × instance count` unless a shared store is added.
- `teardown` is idempotent (`closed` flag), so it is safe to call from both the `reverify` interval and the `'close'` event without double-releasing the slot.
- The module intentionally does not import any authentication middleware; the `reverify` parameter is a plain `() => Promise<boolean>` to keep this layer agnostic of *how* the caller is identified.
