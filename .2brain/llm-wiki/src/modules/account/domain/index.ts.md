---
source: src/modules/account/domain/index.ts
source_sha256: f70971fccad17d683dc80a6b7396682fe24abac56f577336d26f1d2dba7169f0
context_sha256: c954e3d4078103b6a810a9e99a553e913e42805d631fafecb0ffda8ecfcdedfb
generated_at: 2026-11-22T03:28:39.993968+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/domain/index.ts

## Purpose
Barrel file for the account module's domain layer. It re-exports the pure rules for the email-change flow, session proofs, and session revocation. The domain layer is documented as lint-guaranteed to be free of Express, Mongoose, and every tier.

## Key elements
- **From `./email-change`:** `EMAIL_CHANGE_EVENTS`, `EMAIL_CHANGE_STATES`, `emailChangeNext` (the transition function), `emailChangeStateOf`, and `undoRestoresPreviousEmail`. It also re-exports the types `EmailChangeEvent`, `EmailChangeFields`, and `EmailChangeState`.
- **From `./session-proof`:** `AMR`, `firstSessionRefused`, and `withProofs`.
- **From `./revocation`:** `REVOCATION` and `announces`. It also re-exports the types `RevocationCause`, `RevocationRow`, and `SessionsRevokedReason`.

## Relationships
- Re-exports from `src/modules/account/domain/email-change.ts`, `src/modules/account/domain/session-proof.ts`, and `src/modules/account/domain/revocation.ts`, which are the only sources it aggregates.
- `src/modules/account/index.ts` is a graph neighbor, so it is part of the module's public surface chain. The domain barrel is the layer's entry point.
- `src/modules/account/services/email-change.ts` and `src/modules/account/services/verification.ts` are neighbors and consumers of the domain rules.
- `src/modules/account/tests/unit/email-change-domain.test.ts` is a neighbor, and covers the email-change domain.

## Notes
- `epoch.ts` (the session-epoch rule) is deliberately **not** re-exported. `session/` imports it directly, because the barrel never publishes `session/`'s token surface.
- The module docblock references a section on the lint rule enforcing the domain layer's purity ("the rule enforced by lint") in its `@see` tag.
