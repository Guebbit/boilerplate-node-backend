---
source: src/modules/returns/tests/unit/public-events.test.ts
sha256: 9d15fbf5352dabb61ef7887cb652b8b3abd23f80ca16aceb857edb452ad08eec
generated_at: 2026-11-08T08:12:58.613044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/public-events.test.ts

## Purpose

Verifies that the returns module's `publicEvents` registry projects domain events into the correct external shape—right event name, right payload fields—and that sensitive fields (e.g. the customer's free-text note) are stripped before reaching webhook subscribers.

## Key elements

- **`describe('the returns module's public events')`** — the single test suite in this file.
- **Test: "tells subscribers a return was requested…"** — asserts `returnsModule.publicEvents[RETURN_REQUESTED].toPublicEvent(…)` yields `{ eventType: 'return.requested', data: { returnId, orderId, reason } }`.
- **Test: "never carries the customer's own words…"** — feeds a `note` field into the domain event and asserts it is absent from both the JSON stringification and the `data` object.
- **Test: "tells subscribers the goods were received…"** — asserts `returnsModule.publicEvents[RETURN_RECEIVED].toPublicEvent(…)` yields `{ eventType: 'return.received', data: { returnId, orderId } }`.

## Relationships

- **`src/modules/returns/module.ts`** — imports `returnsModule` (default export) and reads its `publicEvents` record; this test exercises the `toPublicEvent` projection functions registered under each event key.
- **`src/modules/returns/events.ts`** — imports the `RETURN_REQUESTED` and `RETURN_RECEIVED` string constants, which serve as the keys to look up the correct projection in `publicEvents`.

## Notes

- Every call to `toPublicEvent` casts its argument with `as never`. This is intentional: the registry signature types the input as `never` so a single generic registry can hold every module's heterogeneous projections without widening.
- The PII-stripping test checks both the serialized JSON *and* the `data` object property. If you add a new field to the public payload, confirm it does not accidentally pass through the customer's free-text `note`.
