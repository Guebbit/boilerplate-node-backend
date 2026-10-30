---
source: src/modules/returns/tests/unit/public-events.test.ts
sha256: 9d15fbf5352dabb61ef7887cb652b8b3abd23f80ca16aceb857edb452ad08eec
generated_at: 2026-10-29T05:50:59.494096+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/public-events.test.ts

## Purpose
Unit tests that verify the returns module's public event projections — the exact shape and content of the payloads webhook subscribers receive for `RETURN_REQUESTED` and `RETURN_RECEIVED`, as well as the exclusion of customer-supplied free-text fields.

## Key elements
- **`describe('the returns module's public events')`** – top-level suite; no local helpers or mocks, just three assertions against the live module export.
- **Test 1 – "tells subscribers a return was requested…"** – asserts `toPublicEvent` for `RETURN_REQUESTED` yields `{ eventType: 'return.requested', data: { returnId, orderId, reason } }` via exact `toEqual`.
- **Test 2 – "never carries the customer's own words…"** – feeds a `note` field into the domain event and asserts it is absent both from the serialized JSON and from `projected.data` (PII-leak guard).
- **Test 3 – "tells subscribers the goods were received…"** – asserts `toPublicEvent` for `RETURN_RECEIVED` yields `{ eventType: 'return.received', data: { returnId, orderId } }`.

## Relationships
- **`src/modules/returns/module.ts`** – imports `returnsModule` (default export) and reads `returnsModule.publicEvents` to obtain the projection functions keyed by event name. This is the sole production code under test.
- **`src/modules/returns/events.ts`** – imports `RETURN_REQUESTED` and `RETURN_RECEIVED` constants, used as the keys that index into `publicEvents`.

## Notes
- Every call to `toPublicEvent` casts its argument `as never`. This is required by the shared registry signature (one slot typed `never` so a single map can hold projections from all modules); the cast is not a test workaround but a type-system necessity.
- The PII test checks both string absence in the full JSON **and** property absence on `data` — it guards against the field being renamed or moved but still serialized.
- `toEqual` (deep equality) is used on the happy-path tests, so any extra fields in the public payload would fail the assertion.
