---
source: src/modules/returns/tests/unit/public-events.test.ts
source_sha256: de4bf015beb7a93e348c4e2631a188ffc86c4bfd2849d7e4b9025a4004583106
context_sha256: cd4968447555391b6b4eb2b4c94960bd3b6828d39007404763cb9f5f5eb295e5
generated_at: 2026-11-22T07:39:17.314508+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/unit/public-events.test.ts

## Purpose
Unit tests for the public (webhook-facing) events of the returns module. They verify that the module manifest's `publicEvents` projections turn domain events into the event type and payload that subscribers see, and that sensitive data is not leaked.

## Key elements
- **`returnsModule.publicEvents[RETURN_REQUESTED]`**: its `toPublicEvent` must produce `{ eventType: 'return.requested', data: { returnId, orderId, reason } }`.
- **Customer note exclusion test**: given a domain event that also holds a `note` (e.g. a phone number), the projected output must not contain it, either in the serialized JSON or as a `note` property on `data`.
- **`returnsModule.publicEvents[RETURN_RECEIVED]`**: its `toPublicEvent` must produce `{ eventType: 'return.received', data: { returnId, orderId } }`.

## Relationships
- `src/modules/returns/module.ts`: provides the default-exported `returnsModule` manifest, whose `publicEvents` registry is the unit under test.
- `src/modules/returns/events.ts`: supplies the `RETURN_REQUESTED` and `RETURN_RECEIVED` constants, used as keys into `publicEvents`.
- `tests/support/stub.ts` (imported as `@tests/stub`): provides `asStub`, used to build partial domain-event inputs.

## Notes
- Inputs are built with `asStub<never>(...)`. The `toPublicEvent` slot takes `never` so that one registry can hold every module's projections, so test inputs have to be cast.
- The test asserts on `projected?.data`, which suggests `toPublicEvent` may return a nullish value in some cases. The tests here don't exercise that.
