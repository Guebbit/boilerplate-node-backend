---
source: src/modules/account/domain/index.ts
sha256: 81dbcf51a80eb9174d7312aebca0f00983a93b28eba07a8ce6bf37e1916e1b98
generated_at: 2026-10-29T02:33:40.369242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/index.ts

## Purpose

Barrel file for the account **domain layer**. It re-exports the pure business rules (email-change transition table, session-proof helpers, revocation constants) so that upper tiers (services, controllers) import a single entry point. The file itself contains no logic—only `export` statements. A lint rule guarantees the domain layer has zero imports of Express, Mongoose, or any other tier.

## Key elements

- **Email-change exports** (from `./email-change`): `EMAIL_CHANGE_STATES`, `EMAIL_CHANGE_EVENTS`, `emailChangeNext` (transition function), `emailChangeStateOf`, `undoRestoresPreviousEmail`; types `EmailChangeEvent`, `EmailChangeFields`, `EmailChangeState`.
- **Session-proof exports** (from `./session-proof`): `AMR`, `firstSessionRefused`, `withProofs`.
- **Revocation exports** (from `./revocation`): `REVOCATION`, `announces`; types `RevocationCause`, `RevocationRow`, `SessionsRevokedReason`.
- **Intentionally absent**: `epoch.ts` (session-epoch rule) is **not** re-exported here. The `session/` module imports it directly because this barrel must not expose `session/`'s token surface.

## Relationships

- **Re-exports** `email-change.ts`, `session-proof.ts`, and `revocation.ts`—the three sibling domain files.
- **Consumed by** `src/modules/account/index.ts` (parent barrel) and by service-layer files (`services/email-change.ts`, `services/verification.ts`) that import domain rules through this entry point.
- **Tested indirectly** via `tests/unit/email-change-domain.test.ts`, which exercises the re-exported email-change transition logic.

## Notes

- The docblock explicitly warns that `epoch.ts` is excluded. If you need the session-epoch rule, import it from `session/` directly—not from this barrel.
- All exports are pure data/functions with no side effects; safe to import in any tier that respects the dependency rule.
- Refer to `docs/theory/domain-layer.md` for the layering contract that makes this file lint-protected.
