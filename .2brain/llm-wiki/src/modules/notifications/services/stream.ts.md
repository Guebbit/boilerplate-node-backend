---
source: src/modules/notifications/services/stream.ts
sha256: 5080489da646df4169292bd0418abf5dfe1d9dbb9e9692219c40ef8a529f4a0c
generated_at: 2026-10-29T04:31:16.083017+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/stream.ts

## Purpose

Manages live notification delivery over Server-Sent Events (SSE), one stream per open tab, routed per user. It maintains an in-process registry of open HTTP responses and exposes functions to open a new stream and to push a typed event to every stream belonging to a given user. No broker or cross-process fan-out—assumes a single-host deployment.

## Key elements

- **`connections`** (`Map<string, Set<Response>>`) — module-level registry mapping user ID to that user's open SSE responses. `Set` gives O(1) disconnect and prevents duplicates.
- **`HEARTBEAT_INTERVAL_MS`** — 15 s; written as a `: keep-alive` comment line so proxies don't drop the socket and `EventSource` clients ignore it.
- **`writeFrame`** (internal) — serialises one SSE frame (`event:`, `data:`, trailing blank line) and writes it to a `Response`.
- **`publishToUser<TChannel>`** (export) — iterates the user's `Set` and writes the frame to each response; swallows per-socket write errors (the `close` handler is cleaning up) so one dead connection can't abort the fan-out.
- **`openStreamCount`** (export) — sums all `Set` sizes; used by tests and metrics gauges.
- **`streamNotifications`** (export) — opens the stream via `openSseStream`, registers the response in `connections`, starts the heartbeat interval, and wires `onClose` to clear the interval, remove the response from the set, and delete the map entry when the set empties. Accepts a `reverify` callback (polled by `openSseStream`) so the caller can re-check credentials without this file knowing the auth mechanism.

## Relationships

- **`src/infrastructure/http/sse.ts`** — imports `openSseStream`, which sets SSE headers, runs the `reverify` polling loop, and returns a stream handle whose `onClose` is the single teardown hook used here.
- **`src/types/index.ts`** — imports `NotificationsChannel` and `SseEventPayloadMap`, which together make both `publishToUser` and `writeFrame` generic over a closed set of channel names with type-safe payloads.
- **`src/modules/notifications/services/index.ts`** — barrel re-export; the three public functions above are the surface the rest of the module (controllers, inbox service) consumes.
- **`src/modules/notifications/tests/unit/stream.test.ts`** — unit tests exercising `publishToUser`, `openStreamCount`, and the open/close lifecycle of `streamNotifications`.
- **`src/modules/notifications/tests/integration/service.test.ts`** — integration tests that drive the full notification flow, including stream open/publish/close.

## Notes

- **Single-process only.** A `publishToUser` call reaches only the connections registered in *this* worker. If the app ever scales to multiple workers behind one process manager, this needs a fan-out layer; the doc-comment explicitly flags this.
- **Teardown is two-part.** The `onClose` handler must both `clearInterval(heartbeat)` *and* delete the map entry. Leaving the interval running writes to a dead socket forever; leaving the entry pins the entire `Response` in memory.
- **`try/catch` in `publishToUser` is intentional.** A socket the client just dropped will throw on `write`; the `close` handler is already scheduled to clean it up, so rethrowing would fail the *business* write that triggered the push.
- **Heartbeat format.** The `: keep-alive` line is an SSE comment (leading colon), not a named event—`EventSource` clients silently ignore it, so no handler is needed on the frontend.
