---
source: src/modules/account/token-types.ts
sha256: 4285784417436dffcf211a020aecd0f839b5f00236cf83cd018d9b3edde408ae
generated_at: 2026-11-14T19:17:25.197219+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/token-types.ts

## Purpose

Defines the closed, named set of one-time token types stored in the `verificationtokens` table. Exists as a leaf module so that the schema, the services that issue tokens, and the service that purges them can all reference the same string constants and TTLs without importing each other.

## Key elements

- **`PASSWORD_RESET_TOKEN_TYPE`** (`'password'`) — type carried by password-reset or account-setup links.
- **`ACCOUNT_RESTORE_TOKEN_TYPE`** (`'account-restore'`) — type of the link that cancels a scheduled self-deletion; lifetime equals time remaining until `purgeAt`.
- **`EMAIL_VERIFY_TOKEN_TYPE`** (`'verify'`) — signup or re-send verification link; proves the address the account already has.
- **`EMAIL_CHANGE_TOKEN_TYPE`** (`'email-change'`) — proves the address a pending email-change request asked for (`user.pendingEmail`).
- **`EMAIL_CHANGE_UNDO_TOKEN_TYPE`** (`'email-change-undo'`) — link mailed to the old address to undo an email change.
- **`MFA_CHALLENGE_TOKEN_TYPE`** (`'mfa-challenge'`) — second-factor challenge token at login.
- **`DELETION_RESTORE_TOKEN_TYPE`** (`'deletion-restore'`) — claim check for a sign-in during the deletion grace period.
- **`OAUTH_LINK_TOKEN_TYPE`** (`'oauth-link'`) — short-lived proof of *which* account is connecting to an OAuth provider.
- **`OAUTH_LINK_TTL_MS`** — 5 × `MINUTE_MS`; how long a connect attempt may take at the provider.
- **`EMAIL_CHANGE_UNDO_TTL_MS`** — 7 × `DAY_MS`; how long the undo link remains valid.
- **`VERIFICATION_TOKEN_TYPES`** — `as const` array of all eight types; the schema's closed enum.
- **`VerificationTokenType`** — union type derived from `VERIFICATION_TOKEN_TYPES`.
- **`ONE_LIVE_TOKEN_TYPES`** — subset (all except `MFA_CHALLENGE_TOKEN_TYPE` and `DELETION_RESTORE_TOKEN_TYPE`) where at most one live token is allowed; backed by a partial unique index so issuing a new one atomically replaces the old.

## Relationships

- **`src/domain-primitives/time.ts`** — imports `DAY_MS` and `MINUTE_MS` to define the two TTL constants.
- **`src/modules/account/services/revocation.ts`** — explicitly referenced as the module that purges tokens; `ACCOUNT_RESTORE_TOKEN_TYPE` and `EMAIL_CHANGE_UNDO_TOKEN_TYPE` are intentionally *absent* from its pending set so a password reset cannot revoke them.
- **`src/modules/account/services/two-factor-challenge.ts`** — referenced as the consumer of `MFA_CHALLENGE_TOKEN_TYPE`.
- **`src/modules/account/model.ts`** — the schema's closed `type` enum is derived from `VERIFICATION_TOKEN_TYPES`; the partial unique index mirrors `ONE_LIVE_TOKEN_TYPES`.
- **`src/modules/account/services/tokens.ts`** — the service that issues and redeems tokens uses these constants at every call site.
- **`src/modules/account/services/oauth.ts`** — uses `OAUTH_LINK_TOKEN_TYPE` and `OAUTH_LINK_TTL_MS` when initiating a provider connect.

## Notes

- `EMAIL_VERIFY_TOKEN_TYPE` and `EMAIL_CHANGE_TOKEN_TYPE` are deliberately distinct strings. Reusing one for the other's purpose would be an account-takeover bug (a verify token swapping in a `pendingEmail`).
- `MFA_CHALLENGE_TOKEN_TYPE` and `DELETION_RESTORE_TOKEN_TYPE` are excluded from `ONE_LIVE_TOKEN_TYPES` because multiple instances may be in flight simultaneously; all other types enforce one-live-at-a-time via the partial unique index.
- Adding a new token kind requires a single edit: add the constant, append it to `VERIFICATION_TOKEN_TYPES`, and (if single-live) add it to `ONE_LIVE_TOKEN_TYPES`. The schema enum and the index update follow from that one file.
