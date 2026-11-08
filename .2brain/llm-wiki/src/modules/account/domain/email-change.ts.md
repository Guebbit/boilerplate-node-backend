---
source: src/modules/account/domain/email-change.ts
sha256: a656d130402d7bea9880b5818108943cfb1bc37e40d8b6445d48e745ffb46b2e
generated_at: 2026-11-08T04:08:45.494201+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/email-change.ts

## Purpose

A pure, I/O-free finite-state-machine model of the email-change flow. It encodes the four states an account can be in (derived from two optional fields on the User document, never stored separately), the six events that can occur, and the transition table that maps each (state, event) pair to the next state. It exists so the service layer has a single, testable source of truth for "what is allowed and where the account ends up" without coupling to persistence or transport.

## Key elements

- **`EMAIL_CHANGE_STATES` / `EmailChangeState`** — the four states: `idle`, `pending`, `changed`, `changedPending`.
- **`EMAIL_CHANGE_EVENTS` / `EmailChangeEvent`** — the six events: `request`, `resend`, `confirm`, `cancel`, `undo`, `lapse`.
- **`EmailChangeFields`** — the two optional fields (`pendingEmail`, `previousEmail`) the state is read from.
- **`emailChangeStateOf(fields)`** — derives the current `EmailChangeState` from a `{ pendingEmail, previousEmail }` pair.
- **`TRANSITIONS`** (internal) — a `Record<State, Partial<Record<Event, State>>>` table; a missing entry means the event is a no-op in that state.
- **`emailChangeNext(state, event)`** — looks up the transition table; returns the next state or `undefined` (no-op).
- **`undoRestoresPreviousEmail(state)`** — returns `true` only when state is `changed`, distinguishing an undo that restores the old address from one that merely cancels a pending request.

## Relationships

- **`domain/index.ts`** — barrel file that re-exports this module's public API for import by the rest of the codebase.
- **`services/email-change.ts`** — the service layer that calls `emailChangeStateOf`, `emailChangeNext`, and `undoRestoresPreviousEmail` to decide what I/O (sending links, updating the User document) to perform for each incoming HTTP request.
- **`services/verification.ts`** — owns the proof-link verification logic that ultimately triggers the `confirm` event; this module supplies the state transition it must apply.
- **`tests/unit/email-change-domain.test.ts`** — unit-tests the transition table and helper functions in isolation (no service or I/O dependencies).

## Notes

- **Missing entries are no-ops, not errors.** `emailChangeNext` returning `undefined` means the caller should silently ignore the event (safe to repeat), not throw. This is an intentional design choice documented in the `TRANSITIONS` comment.
- **State is never persisted.** It is always derived on the fly from `pendingEmail` / `previousEmail`. The file's doc header calls this out explicitly; do not add a stored `state` field.
- **`changedPending` + `lapse` → `pending`**, not `idle`. The undo window closes, the old address is forgotten, but the pending request from the second change is still awaiting confirmation.
