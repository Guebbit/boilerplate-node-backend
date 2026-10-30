---
source: src/modules/account/token-types.ts
sha256: 55cdcfc41f2812c5e5fe808280f2765f51e3db91a87d6b26f4381b78f6448cd0
generated_at: 2026-10-29T03:06:45.135089+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/token-types.ts

## Purpose

A leaf module that names every token kind stored in the `verificationtokens` table and declares their TTL and uniqueness constraints. It exists so the schema, the issuing flows, and the revocation service can all reference token types by name without importing one another, preventing circular dependencies within the account module.

## Key elements

- **`PASSWORD_RESET_TOKEN_TYPE`** (`'password'`) — token type for password-reset / account-setup links.
- **`ACCOUNT_RESTORE_TOKEN_TYPE`** (`'account-restore'`) — cancels a scheduled self-deletion; lifetime = time until `purgeAt`.
- **`EMAIL_VERIFY_TOKEN_TYPE`** (`'verify'`) — proves the address the account already holds (signup or re-send).
- **`EMAIL_CHANGE_TOKEN_TYPE`** (`'email-change'`) — proves the *requested* address (`user.pendingEmail`), distinct from `EMAIL_VERIFY_TOKEN_TYPE` to prevent cross-use.
- **`EMAIL_CHANGE_UNDO_TOKEN_TYPE`** (`'email-change-undo'`) — undoes a pending email change; mailed to the old address.
- **`MFA_CHALLENGE_TOKEN_TYPE`** (`'mfa-challenge'`) — second-factor challenge during login.
- **`DELETION_RESTORE_TOKEN_TYPE`** (`'deletion-restore'`) — claim check for an account in its deletion grace period; redeemable once at `POST /account/login/restore`.
- **`OAUTH_LINK_TOKEN_TYPE`** (`'oauth-link'`) — ties an OAuth callback back to the specific account that initiated the connect flow.
- **`OAUTH_LINK_TTL_MS`** — 5 minutes; same scale as OAuth cookies.
- **`EMAIL_CHANGE_UNDO_TTL_MS`** — 7 days (`7 * DAY_MS`); long enough for a weekly mail reader.
- **`VERIFICATION_TOKEN_TYPES`** — the closed `as const` array listing all eight kinds; serves as the schema's enum.
- **`VerificationTokenType`** — union type derived from the array.
- **`ONE_LIVE_TOKEN_TYPES`** — subset where the schema enforces a partial unique index (at most one live token of that kind per account). `MFA_CHALLENGE_TOKEN_TYPE` and `DELETION_RESTORE_TOKEN_TYPE` are deliberately excluded because multiple may be in flight simultaneously.

## Relationships

- **`src/domain-primitives/time.ts`** — imports `DAY_MS` to define `EMAIL_CHANGE_UNDO_TTL_MS`.
- **`src/modules/account/model.ts`** — the `verificationtokens` schema's `type` column is a closed enum over `VERIFICATION_TOKEN_TYPES`; the partial unique index covers exactly `ONE_LIVE_TOKEN_TYPES`.
- **`src/modules/account/services/revocation.ts`** — purges expired tokens and maintains a `PENDING_TOKEN_TYPES` set; `ACCOUNT_RESTORE_TOKEN_TYPE` and `EMAIL_CHANGE_UNDO_TOKEN_TYPE` are intentionally excluded from that set.
- **`src/modules/account/services/tokens.ts`** — the issuing/storing service that reads these constants when creating rows.
- **`src/modules/account/services/email-change.ts`** — issues `EMAIL_CHANGE_TOKEN_TYPE` and `EMAIL_CHANGE_UNDO_TOKEN_TYPE` links.
- **`src/modules/account/services/oauth.ts`** — issues `OAUTH_LINK_TOKEN_TYPE` and enforces `OAUTH_LINK_TTL_MS`.
- **`src/modules/account/services/two-factor-challenge.ts`** — issues `MFA_CHALLENGE_TOKEN_TYPE` challenges.
- **`src/modules/account/services/deletion-sign-in.ts`** — issues `DELETION_RESTORE_TOKEN_TYPE` claim tokens.
- **`src/modules/account/services/account-deletion.ts`** — issues `ACCOUNT_RESTORE_TOKEN_TYPE` cancellation links.

## Notes

- `EMAIL_VERIFY_TOKEN_TYPE` and `EMAIL_CHANGE_TOKEN_TYPE` are deliberately distinct. Spending a verify token must not satisfy a pending email change (and vice-versa); conflating them is an account-takeover vector.
- `ONE_LIVE_TOKEN_TYPES` and the schema's partial unique index are the enforcement mechanism: issuing a new token of one of these kinds atomically replaces the old one. MFA challenge and deletion-restore tokens are excluded because multiple simultaneous instances are legitimate.
- Adding a new token kind requires updating both the constant list and the `VERIFICATION_TOKEN_TYPES` array in this single file.
