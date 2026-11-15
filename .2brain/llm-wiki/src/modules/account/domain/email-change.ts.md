---
source: src/modules/account/domain/email-change.ts
sha256: fc06e213ef2c557847062b7eb50b9633555595dcbbe25fbd084fa0aca8b85eaa
generated_at: 2026-11-14T18:35:35.572204+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/email-change.ts

## Purpose

Defines the email-change state machine as a pure transition table with no I/O. It encodes every legal (state, event) → next-state edge in one place so callers can derive the account's email-change status from two optional User fields and determine where an event leads, without touching the database or network.

## Key elements

- **`EMAIL_CHANGE_STATES` / `EmailChangeState`** – The four states: `idle`, `pending`, `changed`, `changedPending`. Derived from the presence/absence of `pendingEmail` and `previousEmail`.
- **`EMAIL_CHANGE_EVENTS` / `EmailChangeEvent`** – The six events: `request`, `resend`, `confirm`, `cancel`, `undo`, `lapse`.
- **`EmailChangeFields`** – Interface for the two optional fields (`pendingEmail`, `previousEmail`) the state is read from.
- **`emailChangeStateOf(fields)`** – Maps a `{ pendingEmail, previousEmail }` pair to one of the four states.
- **`emailChangeNext(state, event)`** – Looks up the transition table; returns the next state or `undefined` when the event does not apply to that state (callers treat that as a no-op, not an error).
- **`undoRestoresPreviousEmail(state)`** – Returns whether the state is `changed`, i.e. the undo link restores the old address rather than discarding a pending one.
- **`TRANSITIONS`** (module-private) – The full state×event matrix; missing entries mean "no-op."

## Relationships

- **`src/modules/account/domain/index.ts`** – Barrel file; re-exports the public symbols of this module so consumers can import from the domain root.
- **`src/modules/account/services/email-change.ts`** – Service layer that performs the I/O (sending proof/undo links, persisting field changes). It calls `emailChangeStateOf` to read current state, `emailChangeNext` to validate transitions, and `undoRestoresPreviousEmail` to decide whether an undo link restores or discards the previous address.
- **`src/modules/account/services/verification.ts`** – Handles proof-link verification (the `confirm` / `resend` events). Feeds its results back into the email-change flow; the domain table here defines which states accept those events.
- **`src/modules/account/tests/unit/email-change-domain.test.ts`** – Unit tests exercising every cell of the transition table and the helper functions.

## Notes

- A missing entry in `TRANSITIONS` is a **no-op**, not an error. All events are idempotent by design—repeating one is always safe, so callers should not branch on `undefined` vs. a valid state for error handling.
- The state is **never stored**; it is always derived from the two optional fields at read time. This file is the single source of truth for the derivation and the edge list.
- `changedPending` is the only state that has six of six events mapped; `idle` has only one (`request`).
- See `docs/modules/account.md#proving-an-address` for the broader narrative around why the table exists.
