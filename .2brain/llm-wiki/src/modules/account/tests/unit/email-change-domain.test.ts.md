---
source: src/modules/account/tests/unit/email-change-domain.test.ts
sha256: 7fe2a2088ad03c7cfb57c99bbfb79113bdbc05c9c8915181e91beb2d2a8b3086
generated_at: 2026-11-08T04:46:37.945433+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/email-change-domain.test.ts

## Purpose
Exhaustive unit tests for the email-change state machine. Every `(state, event)` pair is checked against a single transition table (`EDGES`), so an edge added or dropped in the domain by mistake fails immediately. Also verifies that `emailChangeStateOf` correctly derives the state from the two stored email fields, and that `undoRestoresPreviousEmail` is true only for `'changed'`.

## Key elements
- **`EDGES`** — `readonly` array of all valid `[from, event, to]` triples (15 entries). Any pair not listed is expected to produce no transition (`undefined`).
- **`describe('emailChangeNext')`** — `it.each` over the full `EMAIL_CHANGE_STATES × EMAIL_CHANGE_EVENTS` Cartesian product; asserts the returned next-state matches (or is absent for) the corresponding `EDGES` entry.
- **`describe('emailChangeStateOf')`** — Table-driven checks mapping `{ pendingEmail, previousEmail }` field combinations to the expected `EmailChangeState`.
- **`describe('undoRestoresPreviousEmail')`** — Filters `EMAIL_CHANGE_STATES` through the predicate and asserts only `'changed'` qualifies.

## Relationships
- **`src/modules/account/domain/email-change.ts`** — Defines all tested exports (`emailChangeNext`, `emailChangeStateOf`, `undoRestoresPreviousEmail`) and the constants/types (`EMAIL_CHANGE_STATES`, `EMAIL_CHANGE_EVENTS`, `EmailChangeEvent`, `EmailChangeState`).
- **`src/modules/account/domain/index.ts`** — Barrel re-export; this file imports via the relative path `../../domain`, which resolves through this barrel.

## Notes
- The test is self-extending: adding a new state to `EMAIL_CHANGE_STATES` or a new event to `EMAIL_CHANGE_EVENTS` automatically generates additional `it.each` rows. Unlisted pairs assert `undefined`, so a missing entry in `EDGES` is caught as a failure rather than silently passing.
- `emailChangeStateOf` treats an explicit `null` value identically to an absent field (both resolve to `'idle'`).
