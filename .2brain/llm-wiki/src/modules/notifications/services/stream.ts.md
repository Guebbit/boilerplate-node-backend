---
source: src/modules/notifications/services/stream.ts
sha256: 7650159783c5f42341c7a7c27fa9bd5c3420b3be7a7f16f114997332abc072d4
generated_at: 2026-11-14T20:26:02.736919+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/stream.ts

## Purpose

Live delivery of notifications over Server-Sent Events, one stream per open tab, routed by user so a frame reaches only that user's connections. Uses the same plain-HTTP, per-process pattern as the observability stream: no broker fan-out, single-host assumption.

## Key elements

- **`connections`** (module-private `Map<string, Set<Response>>`) — tracks open SSE responses per user. A `Set` makes disconnect O(1) and prevents duplicate registration.
- **`HEARTBEAT_INTERVAL_MS`** — 15 000 ms; idle proxies typically drop connections after 30–60 s of silence.
- **`writeFrame`** (private) — writes one SSE frame (`event:` + single-line `data:` JSON + trailing blank line) to a response.
- **`publishToUser`** (exported) — pushes a typed frame to every open stream for a given user. Swallows write errors on dropped sockets; the `close` handler handles cleanup.
- **`openStreamCount`** (exported) — total open streams across all users; intended for tests and gauges.
- **`streamNotifications`** (exported) — opens an SSE stream for a user via `openSseStream`, registers the response in `connections`, starts a 15 s heartbeat interval (written as an SSE comment so `EventSource` ignores it), and wires `onClose` to clear the interval, remove the response, and delete the Map key when the last stream for that user closes.

## Relationships

- **`src/infrastructure/http/sse.ts`** — imports `openSseStream`, which sets SSE headers, enforces a concurrent-stream cap, and polls the `reverify` callback for permission rechecks.
- **`src/types/index.ts`** — imports `NotificationsChannel` and `SseEventPayloadMap` to type channel names and payloads.
- **`src/modules/notifications/services/inbox.ts`** — consumes `publishToUser` to fan a newly written notification out to the user's live streams.
- **`src/modules/notifications/services/index.ts`** — barrel re-export of this module's public API.
- **`src/modules/notifications/tests/unit/stream.test.ts`** — unit tests for frame writing, publish, and stream lifecycle.
- **`src/modules/notifications/tests/integration/stream-cap.test.ts`** — integration tests verifying the concurrent-stream cap behavior.
- **`src/modules/notifications/tests/integration/service.test.ts`** — end-to-end notification service tests that exercise live delivery.

## Notes

- **Per-process only.** A message written in another worker arrives at the next `GET /notifications`, not over the stream. The app is designed to run as a single host; there is no cross-process fan-out.
- **Heartbeat is an SSE comment** (`: keep-alive\n\n`), not a named event, so the client's `EventSource` silently discards it and no application-level handler fires.
- **`reverify` is a plain `() => Promise<boolean>` callback** so this file stays agnostic of the authentication mechanism; the controller wires it to the refresh cookie.
- **Cleanup is two-part:** the interval must be cleared *and* the Map entry removed. A leaked interval writes to a dead socket forever; a leaked Map entry pins the response in memory.
- **Write-error swallowing in `publishToUser` is intentional** (eslint suppression included). A dropped socket will have its `close` handler remove it; throwing here would fail the very write that triggered the broadcast.
