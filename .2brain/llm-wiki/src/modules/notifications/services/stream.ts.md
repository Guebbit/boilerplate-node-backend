---
source: src/modules/notifications/services/stream.ts
source_sha256: 399ae13604084515f94c3f39e4c0cd45137bcfe8f8f8d349b585571c36e24b12
context_sha256: 09e764fc79128ef023e795b2a2c1fa89818e34acf6277d536038c50a39916e15
generated_at: 2026-11-22T05:56:18.815977+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/services/stream.ts

## Purpose
Live delivery of notifications over Server-Sent Events, one stream per open browser tab, routed by user so a frame reaches only the connections of the user it concerns. It follows the same pattern as the observability stream (`src/modules/observability/services/stream.ts`), but keeps a `Map` keyed by user instead of a flat `Set`. Across processes (copies, the cron container) frames travel over Redis pub/sub.

## Key elements
- `publishToUser(userId, event, payload)` — the public push entry point. Delivers to this process's streams first, then publishes `{origin, userId, event, payload}` on the channel. It is fire-and-forget: a Redis outage costs other processes the frame but never fails the caller. The payload type is tied to the event by `SseEventPayloadMap`.
- `streamNotifications(response, userId, reverify)` — opens a stream through `openSseStream`, registers it in the `connections` map, starts the pub/sub subscription, starts a 15s `: keep-alive` comment heartbeat, and cleans up on close. `reverify` is a callback that re-checks whether the caller still holds the key that opened the stream. `openSseStream` polls it, and the controller wires it to the refresh cookie.
- `openStreamCount()` — total open streams across all users, for tests and gauges.
- `connections` — `Map<userId, Set<OpenStream>>`. `OpenStream` holds the `response` and an `end()` function.
- `deliverLocally` — writes a frame (`event:` / `data:` JSON / blank line) to each of a user's local streams. Write errors are swallowed because the `close` handler will remove the dead socket.
- `onFanoutMessage` — handles an incoming channel message. It parses and validates it with `fanoutMessageSchema` (zod), drops malformed messages, and skips messages whose `origin` is this process's `originId`.
- `endEveryStream` — called when the pub/sub link is lost. It ends all local streams so clients reconnect (after `retry:`) and re-read their inbox.
- Constants: `FANOUT_CHANNEL = 'notifications'`, `originId` (a random UUID per process), `HEARTBEAT_INTERVAL_MS = 15_000`.

## Relationships
- `src/infrastructure/adapters/pubsub.ts` — `publishMessage` sends frames to other processes. `subscribeToChannel(channel, onMessage, onLost)` receives them and reports a lost link.
- `src/infrastructure/http/sse.ts` — `openSseStream` writes the headers and applies the stream cap. It returns nothing when a cap refuses the open, and otherwise returns an object with `end` and `onClose`.
- `src/types/index.ts` — supplies `NOTIFICATIONS_CHANNELS`, `NotificationsChannel` and `SseEventPayloadMap`.
- `src/modules/notifications/services/inbox.ts` and `src/modules/notifications/services/index.ts` — graph neighbors, but this file shows no direct interaction with them. The "re-read their inbox" behavior refers to `GET /notifications`.
- Tests: `src/modules/notifications/tests/unit/stream.test.ts`, `src/modules/notifications/tests/integration/service.test.ts` and `src/modules/notifications/tests/integration/stream-cap.test.ts` exercise this file.

## Notes
- Without Redis, delivery is local only. Clients on other processes see the missed frames at their next `GET /notifications`.
- Local delivery happens before publishing, and the publishing process skips its own message via `originId`, so a frame is not delivered twice.
- `subscribeToChannel` is called on every stream open. The comment says listening starts with the first stream and is retried by each later one. Its rejection is caught (`.catch(() => false)`).
- Heartbeats are SSE comment lines, so clients receive no heartbeat event.
- The close handler must clear the interval and remove the map entry. Otherwise the timer keeps writing to a dead socket and the entry keeps the response in memory.
- The module's doc comment refers to a "more-than-one-process" section of the notifications docs for the multi-process design.
