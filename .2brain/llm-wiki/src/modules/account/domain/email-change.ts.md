---
source: src/modules/account/domain/email-change.ts
generated_at: 2026-11-22T03:28:20.097699+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/domain/email-change.ts

## Purpose
A pure, I/O-free transition table for the email-change flow. The state is never stored: it is derived from two optional User fields (`pendingEmail`, `previousEmail`). The table is the single place listing every state/event edge.

## Key elements
- `EMAIL_CHANGE_STATES` / `EmailChangeState`: `idle`, `pending`, `changed`, `changedPending`.
  - `idle`: nothing pending, no previous address kept.
  - `pending`: a new address awaits its proof link.
  - `changed`: the swap happened, and the old address is kept for the undo window.
  - `changedPending`: a second change was requested during the undo window.
- `EMAIL_CHANGE_EVENTS` / `EmailChangeEvent`: `request`, `resend`, `confirm`, `cancel`, `undo`, `lapse`.
- `EmailChangeFields`: `{ pendingEmail?, previousEmail? }`, each optional and nullable.
- `emailChangeStateOf(fields)`: maps the two fields to a state by truthiness.
- `emailChangeNext(state, event)`: looks up the `TRANSITIONS` table. It returns the next state, or `undefined` if the event does not apply in that state.
- `undoRestoresPreviousEmail(state)`: true only for `changed`. In that state an undo link restores the old address. In other states it cancels a pending one.
- `TRANSITIONS` (private): the table itself.

## Relationships
- Exported through `src/modules/account/domain/index.ts`.
- Likely consumed by the service layer (`src/modules/account/services/email-change.ts`, `src/modules/account/services/verification.ts`). The file contains no code that calls them, so only the dependency link is visible here.
- Covered by `src/modules/account/tests/unit/email-change-domain.test.ts`.

## Notes
- `undefined` from `emailChangeNext` means a no-op, not an error, because each event is safe to repeat.
- Notable edges:
  - `pending` + `undo` → `idle`.
  - `changedPending` + `cancel`, `undo` or `confirm` → `changed`.
  - `changedPending` + `lapse` → `pending`.
  - `changed` has no `resend`, `confirm` or `cancel`, and `idle` accepts only `request`.
- State detection uses `Boolean()`, so empty strings, `null` and `undefined` all count as absent.
- The file header references `docs/modules/account.md#proving-an-address` for background.
