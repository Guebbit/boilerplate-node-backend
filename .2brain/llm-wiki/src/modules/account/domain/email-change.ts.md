---
source: src/modules/account/domain/email-change.ts
sha256: 304b5ab253b2b1aa1dd99fafdec3ae7cb23062bdbbfd18126b7b9c82c0da48e3
generated_at: 2026-10-14T08:38:44.304692+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/email-change.ts

## Purpose

Pure, I/O-free finite-state machine for the account email-change flow. It encodes every valid state, event, and transition as a lookup table so the *where* and *what* of an email change is defined in exactly one place. The service layer and tests consume this table; no HTTP, no database, no email is touched here.

## Key elements

- **`EMAIL_CHANGE_STATES`** — The four states (`idle`, `pending`, `changed`, `changedPending`) as a const tuple; also the source of the `EmailChangeState` union type.
- **`EMAIL_CHANGE_EVENTS`** — The six events (`request`, `resend`, `confirm`, `cancel`, `undo`, `lapse`) as a const tuple; also the source of the `EmailChangeEvent` union type.
- **`EmailChangeFields`** — Interface for the two optional User-document fields (`pendingEmail`, `previousEmail`) from which state is derived.
- **`emailChangeStateOf(fields)`** — Maps a `{ pendingEmail, previousEmail }` pair to one of the four states. Pure function; no I/O.
- **`TRANSITIONS`** (module-private) — The core lookup table: `Record<EmailChangeState, Partial<Record<EmailChangeEvent, EmailChangeState>>>`. A missing key means the event is a no-op in that state.
- **`emailChangeNext(state, event)`** — Public accessor for the transition table; returns the next state or `undefined` (no-op).
- **`undoRestoresPreviousEmail(state)`** — Predicate: `true` only when `state === 'changed'`, i.e. there is a stored old address to restore rather than a pending one to discard.

## Relationships

- **`domain/index.ts`** — Re-exports this module's public symbols so other files can `import { … } from '…/domain'` without reaching into the file directly.
- **`services/email-change.ts`** — The service that *does* the I/O (write User doc, send emails). It calls `emailChangeStateOf` to read current state, `emailChangeNext` to validate an incoming action, and `undoRestoresPreviousEmail` to decide whether an undo link restores or cancels.
- **`services/verification.ts`** — Owns the proof-link / undo-link tokens. The `confirm` and `undo` events in the transition table correspond to actions that only fire after `verification.ts` validates a token; this file merely records the resulting state change.
- **`tests/unit/email-change-domain.test.ts`** — Exercises every cell of `TRANSITIONS` (valid and no-op), all four outputs of `emailChangeStateOf`, and the `undoRestoresPreviousEmail` predicate. No network or DB mocks needed because the module is side-effect free.

## Notes

- **No-op, not error.** A missing transition entry is intentional: the caller should treat it as a silent no-op (idempotent repeat), never throw. The service layer must honour this contract.
- **State is never stored.** It is always re-derived from `pendingEmail` / `previousEmail` via `emailChangeStateOf`. If you see a stored `emailChangeState` column, it's a bug or a legacy artifact.
- **`changedPending` + `lapse` → `pending`.** This is the one transition where the old address is dropped *and* the new pending address survives. It is easy to misread as "lapse resets to idle" — it does not.
- **`as const` + index access** means the string unions are the *only* valid values; passing an arbitrary string to `emailChangeNext` is a compile error, not a runtime one.
