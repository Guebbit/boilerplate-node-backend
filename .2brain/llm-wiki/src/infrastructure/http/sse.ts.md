---
source: src/infrastructure/http/sse.ts
sha256: 5e6cc0c1f27b8b2d1e2707fa76c2e1b74a3e3c73a1d5f77e5da0302c7894f565
generated_at: 2026-10-29T02:05:52.008400+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/sse.ts

## Purpose

Shared infrastructure for opening a Server-Sent Events stream: sets the required headers, starts a periodic permission re-verification (every 30 s), and provides idempotent teardown. It deliberately stays agnostic of *what* the stream emits or *who* owns it—those concerns remain with the calling module.

## Key elements

- **`REVERIFY_INTERVAL_MS`** (constant, 30 000) — how often an open stream re-proves the caller still holds the key that opened it.
- **`SseStream`** (interface) — handle returned to the stream owner; exposes `onClose(cleanup)` so the owner can register one-shot teardown work (clear timers, remove from registry).
- **`openSseStream(response, reverify)`** — the sole exported function. Sets `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`; flushes headers; starts a `setInterval` that calls `reverify()` and ends the stream on `false` *or* rejection; wires `response.on('close', teardown)`; returns an `SseStream`.

## Relationships

- **`src/modules/notifications/services/stream.ts`** — consumes `openSseStream` to open the notifications SSE stream; supplies its own `reverify` callback and registers frame/heartbeat logic via `onClose`.
- **`src/modules/observability/services/stream.ts`** — same consumer role for the observability stream.
- **`tests/unit/infrastructure/http/sse.test.ts`** — unit-tests header setting, reverify failure paths, teardown idempotency, and `onClose` registration.

## Notes

- The reverify callback is intentionally a plain `() => Promise<boolean>` so this file never imports or references the authentication mechanism. A *rejected* promise is treated identically to `false`—both end the stream.
- `teardown` is idempotent (`closed` guard). The `close` event fires both on client disconnect *and* after `response.end()` from a revoked recheck, so the guard prevents double-running cleanups.
- `no-transform` is set to prevent intermediate proxies from gzipping or buffering the body, which would delay frame delivery.
- The `reverifyTimer` interval is cleared in teardown; there is no manual "stop rechecking" API—teardown is the only path.
