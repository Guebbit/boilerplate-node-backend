---
source: src/modules/account/token-types.ts
sha256: 24fb84fa117c51bd02f4576c2241370f7e1e26b4a8822f825a950f46ccd1aa94
generated_at: 2026-11-08T04:51:10.297378+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/token-types.ts

## Purpose

A leaf module that names every `type` value stored in the `verificationtokens` table. It exists so the schema, the token-issuing services, and `./services/revocation` can all reference token kinds by a shared constant without importing each other, and so TTLs and uniqueness policy live next to the type names they belong to.

## Key elements

- **Token-type string constants** — `PASSWORD_RESET_TOKEN_TYPE`, `ACCOUNT_RESTORE_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE`, `EMAIL_CHANGE_UNDO_TOKEN_TYPE`, `MFA_CHALLENGE_TOKEN_TYPE`, `DELETION_RESTORE_TOKEN_TYPE`, `OAUTH_LINK_TOKEN_TYPE`. Each is the literal value written into `verificationtokens.type`.
- **TTL constants** — `OAUTH_LINK_TTL_MS` (5 min) and `EMAIL_CHANGE_UNDO_TTL_MS` (7 days). Other tokens get their TTL at the call site.
- **`VERIFICATION_TOKEN_TYPES`** — `as const` array listing every valid token type; serves as the closed enum the schema enforces.
- **`VerificationTokenType`** — union-of-literals type derived from the array.
- **`ONE_LIVE_TOKEN_TYPES`** — subset of types where the schema enforces a partial unique index (at most one live token per user). MFA challenge and deletion-restore are deliberately excluded (multiple may be in flight).

## Relationships

- **`src/domain-primitives/time.ts`** — imports `DAY_MS` and `MINUTE_MS` to define the two TTL constants.
- **`src/modules/account/services/revocation.ts`** — the primary consumer that purges expired tokens; its `PENDING_TOKEN_TYPES` set is intentionally a subset of `ONE_LIVE_TOKEN_TYPES` (excludes `ACCOUNT_RESTORE_TOKEN_TYPE` and `EMAIL_CHANGE_UNDO_TOKEN_TYPE` so a password reset doesn't revoke a restore/undo link).
- **`src/modules/account/services/two-factor-challenge.ts`** — issues and redeems `MFA_CHALLENGE_TOKEN_TYPE`.
- **`src/modules/account/services/oauth.ts`** — issues `OAUTH_LINK_TOKEN_TYPE` at the start of a provider link flow.
- **`src/modules/account/services/email-change.ts`** — issues `EMAIL_CHANGE_TOKEN_TYPE` and `EMAIL_CHANGE_UNDO_TOKEN_TYPE`.
- **`src/modules/account/services/deletion-sign-in.ts`** — issues `DELETION_RESTORE_TOKEN_TYPE` during the deletion grace period.
- **`src/modules/account/services/password-reset.ts` / `password-reset-request.ts`** — issue/redeem `PASSWORD_RESET_TOKEN_TYPE`.
- **`src/modules/account/model.ts`** — defines the `verificationtokens` table whose `type` column is constrained by `VERIFICATION_TOKEN_TYPES`.
- **`src/modules/account/repository.ts`** — performs the upserts governed by `ONE_LIVE_TOKEN_TYPES`.

## Notes

- The file imports **only** from `@domain-primitives/time`; it has zero dependencies on sibling service or model files. Any service that needs a type constant imports from here, never the reverse.
- `EMAIL_VERIFY_TOKEN_TYPE` and `EMAIL_CHANGE_TOKEN_TYPE` are distinct on purpose: spending one must never satisfy the other, since a cross-use would be an account-takeover vector.
- New token types must be added to **both** `VERIFICATION_TOKEN_TYPES` (for the schema enum) and, if single-live, `ONE_LIVE_TOKEN_TYPES`. Forgetting one silently breaks uniqueness or validation.
