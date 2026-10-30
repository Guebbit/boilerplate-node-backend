---
source: src/modules/account/domain/email-change.ts
sha256: a656d130402d7bea9880b5818108943cfb1bc37e40d8b6445d48e745ffb46b2e
generated_at: 2026-10-29T02:33:23.726492+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/email-change.ts

## Purpose

A pure, I/O-free state machine that models the email-change lifecycle. It encodes every valid `(state → event → next state)` edge in a single lookup table, so the service layer never re-derives "what is allowed here." The state itself is not persisted; it is derived on the fly from two optional fields on the User document.

## Key elements

- **`EMAIL_CHANGE_STATES` / `EmailChangeState`** – The four states: `idle`, `pending`, `changed`, `changedPending`.
- **`EMAIL_CHANGE_EVENTS` / `EmailChangeEvent`** – The six events: `request`, `resend`, `confirm`, `cancel`, `undo`, `lapse`.
- **`EmailChangeFields`** – The `{ pendingEmail?, previousEmail? }` pair read from the User document to derive state.
- **`emailChangeStateOf(fields)`** – Maps the two optional fields to the corresponding state (pure boolean logic, no I/O).
- **`TRANSITIONS`** (module-private) – The exhaustive `(state, event) → next-state` table. A missing key means the event is a no-op in that state.
- **`emailChangeNext(state, event)`** – Public accessor for `TRANSITIONS`; returns the next state or `undefined` for a no-op.
- **`undoRestoresPreviousEmail(state)`** – Returns `true` only for `changed`, distinguishing "restore old address" from "drop pending address."

## Relationships

- **`domain/index.ts`** – Barrel file; re-exports the public names from this module so consumers can import from the domain root.
- **`services/email-change.ts`** – Consumes `emailChangeStateOf`, `emailChangeNext`, and `undoRestoresPreviousEmail` to decide which I/O (sending proof/undo emails, updating the User doc) to perform for a given event.
- **`services/verification.ts`** – Exercises the `confirm`, `cancel`, `lapse`, and `undo` transitions by calling into the service above when proof/undo links are spent.
- **`tests/unit/email-change-domain.test.ts`** – Unit-tests `emailChangeStateOf`, `emailChangeNext`, and `undoRestoresPreviousEmail` against the full transition table.

## Notes

- A missing entry in `TRANSITIONS` is **intentionally a no-op**, not an error. Every event is safe to repeat (idempotent by design); the caller is expected to treat `undefined` from `emailChangeNext` as "nothing to do."
- The state is never stored. If you need to know "what state is this user in?", call `emailChangeStateOf` with the two fields—there is no cached value to read.
- `changedPending` is the only state where both `pendingEmail` and `previousEmail` are simultaneously set; all other states have at most one of the two.
- The `lapse` event from `changedPending` drops the pending address and falls back to `pending` (the old address is already gone), not back to `idle`.
