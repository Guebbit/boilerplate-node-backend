---
source: src/infrastructure/http/sse.ts
sha256: 5e6cc0c1f27b8b2d1e2707fa76c2e1b74a3e3c73a1d5f77e5da0302c7894f565
generated_at: 2026-11-08T03:34:58.013989+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/sse.ts

## Purpose

Provides the shared plumbing for every Server-Sent Events stream in the system: setting the SSE headers, flushing them so the client sees the stream open immediately, periodically re-verifying that the caller still holds the key that opened the stream (fail-closed), and running idempotent teardown. What each stream *writes* (frames, heartbeat) and what it *tracks* (its own connection registry) is deliberately left to the owning module.

## Key elements

- **`REVERIFY_INTERVAL_MS`** (30 000 ms) – How often an open stream re-proves the caller's key is still valid. A stream has no "next request," so this interval is the only revocation path.
- **`SseStream`** (interface) – The handle `openSseStream` returns. Exposes a single `onClose(cleanup)` method so the owner can register its own teardown (clear timers, remove from its registry).
- **`openSseStream(response, reverify)`** (function, primary export) – Sets SSE headers (`text/event-stream`, `no-transform`, `keep-alive`), flushes them, starts a 30-second `setInterval` that calls `reverify()` and ends the stream if it resolves `false` or rejects, and wires `response.on('close', …)` so any client disconnect triggers teardown. Returns an `SseStream`.

## Relationships

- **`src/modules/notifications/services/stream.ts`** – Calls `openSseStream` to open the notification SSE endpoint; passes its own `reverify` (key/session check) and registers cleanup via the returned `onClose` to remove its entry from the notifications connection registry.
- **`src/modules/observability/services/stream.ts`** – Same pattern for the observability/telemetry stream: calls `openSseStream`, supplies its own re-check, and uses `onClose` to clear its timers and registry entry.
- **`tests/unit/infrastructure/http/sse.test.ts`** – Unit-tests `openSseStream` in isolation: header values, flush ordering, reverify rejection/revocation paths, idempotent teardown, and `onClose` cleanup registration.

## Notes

- `reverify` is typed as a plain `() => Promise<boolean>` so this file has no dependency on any specific auth mechanism. A **rejection** is treated the same as `false`—an error means "no longer allowed," not "try again."
- Teardown is idempotent (`closed` flag). Both the reverify-failure path and the `'close'` event can trigger it; whichever fires first wins, the second is a no-op.
- `Cache-Control: no-cache, no-transform` is intentional: `no-transform` prevents intermediate proxies from buffering or gzipping the body, which would delay frames to the client.
- The file imports `Response` from `express` as a **type only**; there is no runtime Express dependency.
