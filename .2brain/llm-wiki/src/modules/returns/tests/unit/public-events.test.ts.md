---
source: src/modules/returns/tests/unit/public-events.test.ts
sha256: 758110bd59f9fe60e4b7c3b2227fe5d6d5c0864b4c24a56652ff42125cc6b8b4
generated_at: 2026-10-15T12:01:44.860639+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/public-events.test.ts

## Purpose

Unit tests verifying that the returns module's public-event projections (the shape webhook subscribers receive) are correct, well-named, and free of PII. The file exists to guard the public contract between the module's internal domain events and the externally-visible `eventType` / `data` payload.

## Key elements

- **`describe('the returns module's public events')`** — single suite containing three assertions against `returnsModule.publicEvents`.
- **`toPublicEvent` (tested, not defined here)** — the projection function on each entry of the module's `publicEvents` registry; maps a domain-event payload to `{ eventType, data }`.
- **PII-stripping test** — feeds a `note` field into the `RETURN_REQUESTED` projection and asserts the string `'555-0100'` and the `note` key are absent from the output.
- **`as never` casts** — every call to `toPublicEvent` uses `as never`; see the inline comment explaining why.

## Relationships

- **`src/modules/returns/events.ts`** — supplies the `RETURN_REQUESTED` and `RETURN_RECEIVED` string constants used as keys into the `publicEvents` registry and to identify which projection is under test.
- **`src/modules/returns/module.ts`** — exports the `returnsModule` object whose `publicEvents` map is the sole subject of every assertion in this file.

## Notes

- The `as never` cast is **not** a test shortcut: the registry signature intentionally types its value slot as `never` so a single generic registry can hold projections for every module. When adding a new event, the cast is expected.
- Public event names use a **dotted namespace** (`return.requested`, `return.received`), not the raw constant values — the projection is responsible for the rename.
- The PII test checks the serialized JSON (`JSON.stringify`) *and* the `data` object, so a leaked field in either location fails the suite.
