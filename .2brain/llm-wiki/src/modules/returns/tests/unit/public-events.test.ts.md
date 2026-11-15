---
source: src/modules/returns/tests/unit/public-events.test.ts
sha256: de4bf015beb7a93e348c4e2631a188ffc86c4bfd2849d7e4b9025a4004583106
generated_at: 2026-11-14T21:48:55.463963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/public-events.test.ts

## Purpose

Unit tests that verify the returns module's public event projections—i.e., the event name and payload delivered to webhook subscribers—correctly map from the internal domain events and never expose sensitive fields (such as a customer's free-text note).

## Key elements

- **`describe('the returns module's public events')`** – suite grouping all projection assertions.
- **`RETURN_REQUESTED` projection test** – asserts `toPublicEvent` yields `{ eventType: 'return.requested', data: { returnId, orderId, reason } }`.
- **Privacy-leak test** – feeds a domain event that *includes* a `note` field and asserts the projected output contains neither the note text nor a `note` key.
- **`RETURN_RECEIVED` projection test** – asserts `toPublicEvent` yields `{ eventType: 'return.received', data: { returnId, orderId } }`.

## Relationships

- **`src/modules/returns/events.ts`** – source of the `RETURN_REQUESTED` / `RETURN_RECEIVED` constants used as keys into the module's `publicEvents` registry.
- **`src/modules/returns/module.ts`** – default-exports the returns module; tests read its `publicEvents` property and call each entry's `toPublicEvent` method.
- **`tests/support/stub.ts`** – exports `asStub`, used to coerce an object literal into the `never` parameter type so the test can call `toPublicEvent` without a real domain-event instance.

## Notes

- The `toPublicEvent` slot is typed `(e: never) => …` so one registry shape can hold projections for *every* module. Tests therefore must route their fixtures through `asStub<never>`; omitting that cast will fail type-checking, not just at runtime.
- The privacy-leak test asserts on the **serialised** JSON (`JSON.stringify`) as well as the `data` object shape, guarding against the field hiding under an unexpected key.
