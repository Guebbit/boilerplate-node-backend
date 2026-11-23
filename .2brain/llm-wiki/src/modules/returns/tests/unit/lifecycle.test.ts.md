---
source: src/modules/returns/tests/unit/lifecycle.test.ts
source_sha256: 408f2a7430a996b6b1e4219e51f66e6b97edbe06a6962f4ef9249a7172f8b90d
context_sha256: 7457d39527ad19d88cfc064549a1f18abc6a4065cea31b3e959c228996b1e809
generated_at: 2026-11-22T07:39:12.238762+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/unit/lifecycle.test.ts

## Purpose
Unit tests for `returnLifecycle`, the state machine governing a return's status. They pin down which events are allowed from each `ReturnStatus`, where each event lands, the initial status, and that `defineLifecycle` rejects an inconsistent definition.

## Key elements
- **Transitions-from tests**: check `returnLifecycle.eventsFrom(status)` returns, in order:
  - `requested` → `['approve', 'decline']`
  - `approved` → `['receive', 'cancel']`
  - `received` → `['close']`
  - `declined`, `canceled`, `closed` → `[]` (final statuses)
- **Target test**: `returnLifecycle.toOf(event)` maps `approve`→`approved`, `decline`→`declined`, `receive`→`received`, `cancel`→`canceled`, `close`→`closed`.
- **Initial status test**: `returnLifecycle.initial` is `ReturnStatus.requested`.
- **Validation test**: builds a status list without `closed` and calls `defineLifecycle(...)` with `initial: requested` and the real `RETURN_EVENTS`. It expects a throw matching `/unknown "closed"/`.

## Relationships
- Imports `returnLifecycle` and `RETURN_EVENTS` from `../../domain` (`src/modules/returns/domain/index.ts`), which is the module under test.
- Imports `defineLifecycle` from `@domain-primitives/lifecycle` (`src/domain-primitives/lifecycle.ts`) to construct a deliberately invalid lifecycle for the validation test.
- Imports `ReturnStatus` from `@types` (`src/types/index.ts`) for the status values.

## Notes
- Event order in `eventsFrom` assertions is significant, because `toEqual` is used on arrays.
- The validation test shows that `defineLifecycle` checks the event table against the supplied status list. A status that appears in the table but not in the list fails at definition time, which the test calls "refuses to load".
