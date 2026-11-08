---
source: src/modules/account/domain/index.ts
sha256: 81dbcf51a80eb9174d7312aebca0f00983a93b28eba07a8ce6bf37e1916e1b98
generated_at: 2026-11-08T04:09:02.828240+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/index.ts

## Purpose

Barrel (re-export) file for the **account domain layer**. It publishes the pure-rule exports from `email-change.ts`, `session-proof.ts`, and `revocation.ts` so that upper tiers (services, tests) can import domain logic through a single entry point without reaching into individual files. The domain layer is lint-guaranteed to contain no Express, Mongoose, or other tier dependencies.

## Key elements

- **Email-change exports** (re-exported from `./email-change`):
  - `EMAIL_CHANGE_EVENTS` / `EMAIL_CHANGE_STATES` – the event and state constants forming the transition table.
  - `emailChangeNext` – computes the next state given a current state and event.
  - `emailChangeStateOf` – derives the current state from a record's fields.
  - `undoRestoresPreviousEmail` – rule for undo behaviour.
  - Types: `EmailChangeEvent`, `EmailChangeFields`, `EmailChangeState`.
- **Session-proof exports** (re-exported from `./session-proof`):
  - `AMR` – assertion-method-registry constant.
  - `firstSessionRefused` – rule for refusing a first session.
  - `withProofs` – rule to attach proofs to a session.
- **Revocation exports** (re-exported from `./revocation`):
  - `REVOCATION` – revocation constants/enum.
  - `announces` – rule for announcing a revocation.
  - Types: `RevocationCause`, `RevocationRow`, `SessionsRevokedReason`.
- **Deliberate omission**: `epoch.ts` (session-epoch rule) is **not** re-exported here; `session/` imports it directly because the barrel never publishes the `session/` token surface.

## Relationships

- **Re-exports from** `./email-change`, `./session-proof`, `./revocation` — the three sibling domain modules that define the actual rules.
- **Imported by** `src/modules/account/index.ts` (parent barrel) so upper tiers reach domain rules via `account/index`.
- **Consumed by** `src/modules/account/services/email-change.ts` and `src/modules/account/services/verification.ts` — service-layer callers that apply the domain rules without depending on Express/Mongoose.
- **Exercised by** `src/modules/account/tests/unit/email-change-domain.test.ts`, which tests the email-change transition rules through this entry point.

## Notes

- This file contains **no logic** — only `export … from` statements. Any behaviour changes live in the three sibling modules.
- The module doc comment references `docs/theory/domain-layer.md` for the architectural rationale (pure rules, tier isolation).
- Do **not** add a re-export of `epoch.ts` here; that would break the invariant that the barrel never exposes the `session/` token surface.
