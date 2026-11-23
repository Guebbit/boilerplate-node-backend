---
source: src/infrastructure/http/sse.ts
source_sha256: 5c5eb5847a579939ca200feb2183c2b1852ed7d04f66a7e709194f96655051a5
context_sha256: a37cc9d9f88d33103aac66c06acdc909f975bd880eca84bea0cc6cf8b25e8c94
generated_at: 2026-11-22T02:54:23.870169+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/sse.ts

## Purpose
Shared plumbing for every Server-Sent Events stream in the server: response headers, per-process and per-user connection caps, a periodic permission recheck that fails closed, and teardown. What each stream writes (frames, heartbeat) and its own connection registry stay with the owning module.

## Key elements
- `openSseStream(response, userId, reverify)` – admits the stream against the caps, sets status 200 and the SSE headers, flushes headers, and starts the recheck timer. Returns an `SseStream` handle, or `undefined` if a cap refused the open (the 429/503 has already been sent, so the caller must return without registering anything).
- `SseStream` – the handle returned to the owner:
  - `onClose(cleanup)` registers cleanup that runs once when the stream ends (client gone or access revoked).
  - `end()` ends the stream from the server side with a jittered `retry:` field, for owners whose frame source is gone and the client must reconnect and re-read.
- `endSseStreams()` – ends every open stream in the process, each with a jittered `retry:`. Used on drain, because streams never end on their own and `server.close()` waits for them.
- `admit` / `release` (internal) – slot accounting through `openTotal` and the `openPerUser` map. `admit` refuses with 503 when `NODE_SSE_MAX_STREAMS` is reached, or with 429 (`Retry-After` 30 s) when `NODE_SSE_MAX_STREAMS_PER_USER` is reached.
- Constants – `REVERIFY_INTERVAL_MS` (30 s); the drain retry range is 1000–5000 ms, picked with `randomInt`. The upper bound is exclusive.
- `drainers` – set of per-stream drain callbacks that `endSseStreams` walks.

## Relationships
- `src/infrastructure/http/config.ts` – `sseConfig()` supplies the two stream limits.
- `src/infrastructure/http/errors.ts` – `rejectServiceUnavailable` sends the 503 when the process is full.
- `src/infrastructure/http/response.ts` – `rejectResponse` and `generateRateLimited` build the 429 for the per-user cap.
- `src/infrastructure/runtime/readiness.ts` – `isServerDraining()` decides whether to send `Connection: keep-alive`; a draining server omits it.
- `src/infrastructure/runtime/server-lifecycle.ts` – calls `endSseStreams()` at shutdown, after the shutdown delay. It is inferred from the doc comment and the neighbour link, since this file does not import it.
- `src/modules/notifications/services/stream.ts` and `src/modules/observability/services/stream.ts` – the stream owners. They call `openSseStream`, supply a `reverify` callback, and register cleanup via `onClose`. This is inferred from the module doc, since the file does not import them.
- Tests – `tests/unit/infrastructure/http/sse.test.ts` covers this file. `tests/unit/infrastructure/runtime/server-lifecycle.test.ts` covers the drain path.

## Notes
- The recheck is fail-closed: if `reverify()` resolves `false` or rejects, the stream ends.
- Teardown is idempotent, so the slot is released once even when a revoked stream ends itself and the `close` event then fires teardown again.
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-store, no-transform`, and `X-Accel-Buffering: no` to stop nginx buffering. `no-transform` does not prevent buffering.
- The drain `retry:` is randomised so the streams of one stopped copy do not all reconnect in the same second.
- Counters are per-process state held in module-level variables, so the limits apply per server copy and not globally.
- The file is agnostic of how callers authenticate, because that logic is passed in as `reverify`.
