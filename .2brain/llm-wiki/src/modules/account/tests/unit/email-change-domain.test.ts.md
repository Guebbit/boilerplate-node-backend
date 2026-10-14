---
source: src/modules/account/tests/unit/email-change-domain.test.ts
sha256: 7fe2a2088ad03c7cfb57c99bbfb79113bdbc05c9c8915181e91beb2d2a8b3086
generated_at: 2026-10-14T09:20:23.953488+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/email-change-domain.test.ts

## Purpose

Exhaustive unit tests for the email-change finite-state-machine (FSM). Every `(state, event)` pair is asserted against a local transition table so that any edge accidentally added or dropped in the domain logic fails immediately.

## Key elements

- **`EDGES`** – A readonly array of all valid `[fromState, event, toState]` tuples. Serves as the single source-of-truth table inside this file; pairs not listed are expected to resolve to `undefined`.
- **`describe('emailChangeNext')`** – Cartesian-product test (`it.each` over `EMAIL_CHANGE_STATES × EMAIL_CHANGE_EVENTS`). For each pair, looks up the expected next state in `EDGES` and asserts `emailChangeNext` returns it (or `undefined` for invalid transitions).
- **`describe('emailChangeStateOf')`** – Table-driven test of the derived-state reader: verifies that the two storage fields (`pendingEmail`, `previousEmail`) map correctly to `idle`, `pending`, `changed`, or `changedPending`.
- **`describe('undoRestoresPreviousEmail')`** – Asserts that only the `changed` state qualifies for restoring the previous email on undo.

## Relationships

- **`src/modules/account/domain/email-change.ts`** – Provides the functions under test (`emailChangeNext`, `emailChangeStateOf`, `undoRestoresPreviousEmail`) and the enumerations (`EMAIL_CHANGE_STATES`, `EMAIL_CHANGE_EVENTS`) used to build the test matrix.
- **`src/modules/account/domain/index.ts`** – Barrel re-export; this file imports all symbols from the barrel rather than reaching into individual domain files.

## Notes

- The test is **total**: it covers every combination of state × event, not just the listed edges. An unlisted pair is an *expected* `undefined`, which is the guard against accidental permissive transitions.
- If you add a new state or event to the domain module, you **must** also add it to `EDGES` (or explicitly accept `undefined`) here, or the suite will fail.
- `EDGES` is local to this test file and is **not** imported from the domain; it is a deliberate duplicate that encodes the intended behavior independently of the implementation.
