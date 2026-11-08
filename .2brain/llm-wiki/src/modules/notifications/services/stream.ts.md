---
source: src/modules/notifications/services/stream.ts
sha256: 5080489da646df4169292bd0418abf5dfe1d9dbb9e9692219c40ef8a529f4a0c
generated_at: 2026-11-08T06:33:51.903402+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/stream.ts

## Purpose

Manages live Server-Sent Event delivery of notifications, one stream per open browser tab, scoped to a single user. It maintains an in-process `Map<string, Set<Response>>` of active connections so that a published event is written only to the sockets belonging to the affected user. It mirrors the pattern and rationale of the observability stream (plain HTTP SSE, no broker, single-host deployment).

## Key elements

- **`connections`** (module-private) — `Map<string, Set<Response>>` keyed by user id; the `Set` gives O(1) disconnect removal and prevents duplicate registration.
- **`HEARTBEAT_INTERVAL_MS`** — 15 000 ms; kept below the 30–60 s idle-timeout window of common proxies.
- **`writeFrame`** (module-private) — serialises an SSE frame (`event:`, single-line `data:` JSON, trailing blank line) and writes it to one response.
- **`publishToUser`** (exported) — pushes one frame to every open stream for a given user. A user with no open tab costs a single map lookup. Writes to already-dropped sockets are caught and ignored (the `close` handler removes them).
- **`openStreamCount`** (exported) — total number of open streams across all users; intended for tests and metrics gauges.
- **`streamNotifications`** (exported) — opens an SSE stream for a user on a given Express `Response`. Delegates header setup and the periodic `reverify` callback to `openSseStream`, then registers the response in `connections`, starts a 15 s heartbeat timer (comment-line `: keep-alive`), and tears down the timer + map entry on close.

## Relationships

- **`src/infrastructure/http/sse.ts`** — Provides `openSseStream`, which handles SSE-specific headers and polls the `reverify` callback on an interval. This file calls it and then layers the user-scoped connection bookkeeping on top.
- **`src/types/index.ts`** — Supplies the `NotificationsChannel` union and `SseEventPayloadMap` type that parameterise `writeFrame`, `publishToUser`, and `streamNotifications`.
- **`src/modules/notifications/services/index.ts`** — Barrel file that re-exports this module's public API (`publishToUser`, `openStreamCount`, `streamNotifications`) alongside the inbox service.
- **`src/modules/notifications/services/inbox.ts`** — Sibling service in the same module; callers typically read from the inbox (pull) and receive pushes via this stream (push).
- **`src/modules/notifications/tests/unit/stream.test.ts`** — Unit tests exercising `publishToUser`, `openStreamCount`, and `streamNotifications` in isolation.
- **`src/modules/notifications/tests/integration/service.test.ts`** — Integration tests that exercise the notification service end-to-end, including stream lifecycle.

## Notes

- **Single-process assumption.** The `connections` map is per-process. A notification written in another worker will *not* fan out to this process's sockets; it will arrive on the next `GET /notifications` poll. There is no broker.
- **Heartbeat is a comment line** (`: keep-alive`), not a named event. Browsers' `EventSource` ignores leading-colon lines, so clients never see a spurious event, but the wire stays active enough to defeat proxy idle timeouts.
- **`reverify` is a plain `() => Promise<boolean>` callback.** This file is deliberately agnostic of the authentication mechanism; the controller is expected to wire it to a refresh-cookie or similar check. `openSseStream` calls it periodically and closes the stream if it resolves `false`.
- **Swallowed write errors are intentional.** The `try/catch` in `publishToUser` exists because a client that just disconnected is still momentarily in the `Set`. Throwing here would corrupt the caller's write path; the `close` handler will remove the socket.
- **Cleanup is two-part and must stay atomic.** On close, both the heartbeat `setInterval` *and* the `connections` entry must be removed. Leaving the timer running writes to a dead socket forever; leaving the map entry pins the entire Express `Response` (and its upstream socket) in memory.
