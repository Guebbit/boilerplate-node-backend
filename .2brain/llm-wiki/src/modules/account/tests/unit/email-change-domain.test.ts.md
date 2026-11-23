---
source: src/modules/account/tests/unit/email-change-domain.test.ts
source_sha256: 7fe2a2088ad03c7cfb57c99bbfb79113bdbc05c9c8915181e91beb2d2a8b3086
context_sha256: 0c4fec6725c3c517670a51d77b5d794e44b481d12a9eb36e4f710d69c88355a3
generated_at: 2026-11-22T04:05:03.846183+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/email-change-domain.test.ts

## Purpose
Unit tests for the account module's email-change state machine. They check the full transition table, every (state, event) pair, so an edge added or removed by mistake fails here. They also check how the state is derived from the two email fields.

## Key elements
- `EDGES`: the expected list of `[from, event, to]` triples. Any (state, event) pair not listed must not apply.
- `describe('emailChangeNext')`: builds the cross product of `EMAIL_CHANGE_STATES` × `EMAIL_CHANGE_EVENTS` with `it.each`. For each pair it uses `find` on `EDGES` to get the expected target, which is missing when there is no edge. It asserts `emailChangeNext(state, event)` equals that target with `toBe`.
- `describe('emailChangeStateOf')`: maps field combinations to states:
  - `{}` → `idle`
  - `pendingEmail` only → `pending`
  - `previousEmail` only → `changed`
  - both set → `changedPending`
  - both `null` → `idle`
- `describe('undoRestoresPreviousEmail')`: asserts that, across all states, only `changed` returns true. That means undo restores the previous email only from a confirmed swap with nothing pending.

## Relationships
- Imports `EMAIL_CHANGE_EVENTS`, `EMAIL_CHANGE_STATES`, `emailChangeNext`, `emailChangeStateOf`, `undoRestoresPreviousEmail` and the types `EmailChangeEvent` and `EmailChangeState` from `../../domain`. This is the domain barrel, `src/modules/account/domain/index.ts`.
- The implementation under test lives in `src/modules/account/domain/email-change.ts`. The test reaches it only through the barrel, not by a direct import.

## Notes
- The test table is exhaustive by construction. Adding a new state or event to the exported constants automatically adds cases, and each new pair expects no transition until `EDGES` is updated.
- For pairs with no edge, the `find` lookup yields no edge, so the expected value passed to `toBe` is the missing result of that lookup. The "leaves %s" title prints that value.
- In the `emailChangeStateOf` cases, `null` and a missing field are treated the same, both as unset.
