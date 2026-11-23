---
source: src/modules/notifications/tests/unit/stream.test.ts
source_sha256: c55b38ece448f270649fcb909021b894f8f6ba62d1f4d794526c60d4a50e86a0
context_sha256: 0ae374dc1238d15ab8785133fcb3ddcebcc1962e2ff63a92fec77e78e35c2af8
generated_at: 2026-11-22T05:59:44.765187+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/unit/stream.test.ts

## Purpose
Unit tests for the per-user SSE hub in `@modules/notifications/services/stream`. They check three behaviors that fail silently from the outside: the wire format of frames, routing of frames to only the intended user, and teardown on disconnect. Fake timers and a hand-built Express response let the exact bytes written be asserted.

## Key elements
- `jest.mock('@infrastructure/adapters/pubsub', ...)`: replaces `publishMessage` and `subscribeToChannel` (the latter resolves `true`) so cross-process traffic is recorded and driven by hand.
- `HEARTBEAT_INTERVAL_MS` (15 000) and `REVERIFY_INTERVAL_MS` (30 000): copied from the service so that a change to either is noticed.
- `FakeResponse` / `makeResponse()`: a stub `Response` built with `asStub`. It records written frames and set headers, exposes `end`, `write`, `status` and `flushHeaders` mocks, and has `disconnect()`, which fires the `close` handlers.
- `channelCallbacks()`: returns the `onMessage` and `onLost` callbacks from the latest `subscribeToChannel` call. It throws if there is none.
- `lastPublished()`: parses the JSON from the latest `publishMessage` call. It throws if nothing was published.
- `open(userId, reverify?)`: calls `streamNotifications` with a fake response. The recheck passes by default. Every opened fake is disconnected in `afterEach`.
- Test groups:
  - Headers and status: `text/event-stream`, `no-store, no-transform`, `keep-alive`, status 200, and headers flushed before any frame.
  - Frame format: `event: …\ndata: …\n\n`.
  - Per-user routing: multiple tabs for one user, and no delivery to other users.
  - Robustness: publishing with no open streams does not throw, and a write that throws is swallowed.
  - Heartbeat: a `: keep-alive\n\n` comment frame.
  - `teardown`: `openStreamCount()` drops and timers stop on disconnect. The user's entry is kept while another tab is open.
  - `the permission recheck`: the stream stays open when the recheck returns true. It ends when the recheck returns false, and also when it rejects (fails closed).
  - `across processes`:
    - Subscription: the stream subscribes to the `notifications` channel when it opens.
    - Publishing: `publishToUser` delivers locally first, then publishes. It still publishes when the user has no local stream.
    - Inbound messages: a message from another process reaches only its user. A message with its own origin is skipped, and malformed messages are dropped (not JSON, missing user, unknown event).
    - Link loss: `onLost` ends every local stream, each with a reconnect delay.

## Relationships
- `src/modules/notifications/services/stream.ts`: the unit under test. It provides `streamNotifications`, `publishToUser` and `openStreamCount`.
- `src/infrastructure/adapters/pubsub.ts`: mocked entirely. The tests assert on its `publishMessage` and `subscribeToChannel` calls and invoke the listener and loss callbacks passed to the latter.
- `tests/support/stub.ts`: supplies `asStub` (imported as `@tests/stub`), used to cast the partial fake into `Response`.

## Notes
- Timers are faked in `beforeEach`. Recheck tests use `advanceTimersByTimeAsync` so the async recheck promise settles.
- The interval constants are duplicated on purpose. Update them here when the service's values change.
- The ordering test compares `invocationCallOrder` to confirm local delivery happens before publishing.
- The `across processes` block clears the pubsub mocks in its own `beforeEach`.
