---
source: src/modules/notifications/services/stream.ts
sha256: efd2e0fe802abdb98196b3a76ed5c1720c5a393a0a396ea99187e3bf4487998f
generated_at: 2026-10-15T10:51:56.348118+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/stream.ts

## Purpose

Implements live notification delivery over Server-Sent Events. Maintains a per-process `Map<string, Set<Response>>` keyed by user so that a published frame reaches only that user's open browser connections. Handles the full SSE lifecycle: stream opening, keep-alive heartbeats, periodic permission re-verification, and teardown on disconnect.

## Key elements

- **`connections`** — module-level `Map<string, Set<Response>>`; the single source of truth for open streams per user.
- **`writeFrame`** (private) — writes one SSE frame (`event:`, `data:`, trailing blank line) to a `Response`.
- **`publishToUser`** — iterates the user's `Set` and writes a frame to each open stream; deliberately swallows write errors on already-closed sockets so the triggering write is not failed.
- **`openStreamCount`** — returns the total number of open streams across all users (for tests/metrics).
- **`streamNotifications`** — entry point called by the controller. Sets SSE headers, flushes them, registers the response in `connections`, starts a 15 s heartbeat timer and a 30 s permission re-verify timer, and wires `response.on('close')` to clear both timers and remove the entry.
- **`HEARTBEAT_INTERVAL_MS` / `REVERIFY_INTERVAL_MS`** — module constants (15 000 ms / 30 000 ms).

## Relationships

- **`src/types/index.ts`** — imports the `NotificationsChannel` and `SseEventPayloadMap` types that parameterise every public export.
- **`src/modules/notifications/controllers/get-notifications-stream.ts`** — calls `streamNotifications`, supplying the `userId` and a `reverify` callback (wired to the refresh cookie per the doc comment).
- **`src/modules/notifications/services/inbox.ts`** — calls `publishToUser` after a notification is persisted, pushing the frame to the user's open streams.
- **`src/modules/notifications/services/index.ts`** — barrel re-export of the public API.
- **`src/modules/notifications/tests/unit/stream.test.ts`** — unit tests exercising `publishToUser`, `streamNotifications`, and `openStreamCount`.
- **`src/modules/notifications/tests/integration/service.test.ts`** — integration coverage that includes the stream path.

## Notes

- **Per-process only.** There is no broker or cross-worker fan-out; a notification written in another worker arrives on the user's next `GET /notifications`, not on the live stream.
- **Fails-closed re-verify.** If the `reverify` callback rejects, the stream is treated as *not* allowed and is ended. A rejection is never interpreted as "still valid."
- **Heartbeat uses an SSE comment line** (`: keep-alive\n\n`) so that `EventSource`-based clients silently ignore it—no spurious `message` events fire.
- **`Cache-Control: no-cache, no-transform`** is set to prevent a proxy from gzipping or buffering the body, which would delay frame delivery.
- **`publishToUser` has an intentional `eslint-disable`** on the `for…of` + `try/catch`: a write to a dropped socket must not throw and abort the remaining pushes in the loop.
