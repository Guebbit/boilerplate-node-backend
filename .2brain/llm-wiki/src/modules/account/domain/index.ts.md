---
source: src/modules/account/domain/index.ts
sha256: 79bd5cc5f1fde63818a1992989a9463717facb265c704d860057a1b821fffd06
generated_at: 2026-10-14T08:38:55.745314+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/index.ts

## Purpose

Barrel (re-export) module for the **account domain layer**. It exposes the pure business rules—email-change state transitions, session-proof validation, and session revocation—as a single import surface. The file contains no logic of its own; it exists so consumers (services, tests) can import from one path rather than reaching into individual domain files.

## Key elements

- **Email-change exports** (from `./email-change`):
  - `EMAIL_CHANGE_STATES`, `EMAIL_CHANGE_EVENTS` — the state/event constants of the transition table.
  - `emailChangeNext`, `emailChangeStateOf` — transition-table helpers (next-state lookup / state derivation).
  - `undoRestoresPreviousEmail` — rule for the undo action.
  - Types: `EmailChangeEvent`, `EmailChangeFields`, `EmailChangeState`.
- **Session-proof exports** (from `./session-proof`):
  - `AMR` — assertion metadata reference constant.
  - `firstSessionRefused`, `withProofs` — rules governing session-proof acceptance.
- **Revocation exports** (from `./revocation`):
  - `REVOCATION`, `announces` — revocation constants / announcement helper.
  - Types: `RevocationCause`, `RevocationRow`, `SessionsRevokedReason`.

## Relationships

- **Re-exports from** `email-change.ts`, `session-proof.ts`, and `revocation.ts` (same directory)—those files hold the actual logic.
- **Consumed by** `services/email-change.ts` and `services/verification.ts`, which import the domain rules to implement their respective application flows.
- **Exercised by** `tests/unit/email-change-domain.test.ts`, which imports the email-change exports to assert transition-table behaviour.

## Notes

- The module header explicitly states this tier is lint-guaranteed free of Express, Mongoose, and all other framework dependencies. Do not add framework imports here or in the re-exported files without updating the lint rules.
- See `docs/theory/domain-layer.md` for the layering contract this file enforces.
- Because this is a pure re-export barrel, there is no runtime code to test directly; unit tests target the underlying files (`email-change.ts`, etc.) via these re-exports.
