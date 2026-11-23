---
source: src/modules/account/token-types.ts
source_sha256: 4285784417436dffcf211a020aecd0f839b5f00236cf83cd018d9b3edde408ae
context_sha256: 7f0a9beb4d655921ef9aee406f27329a07eb0972697e0fc36770889c8a1c3fa6
generated_at: 2026-11-22T04:10:13.126192+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/token-types.ts

## Purpose
Central, dependency-light list of the one-time token kinds stored in `verificationtokens`. It is a leaf module, so the schema, the flows that issue tokens, and `src/modules/account/services/revocation.ts` (which purges them) can all name the types without importing each other. Naming them here also ties each type string to its policy (TTL, uniqueness) instead of leaving bare strings at call sites.

## Key elements
- **Token type constants** (the `type` column values):
  - `PASSWORD_RESET_TOKEN_TYPE` (`'password'`): password-reset or account-setup link.
  - `ACCOUNT_RESTORE_TOKEN_TYPE` (`'account-restore'`): cancels a scheduled self-deletion. Its lifetime is the time left until `purgeAt`.
  - `EMAIL_VERIFY_TOKEN_TYPE` (`'verify'`): signup or re-send verification, for the address the account already has.
  - `EMAIL_CHANGE_TOKEN_TYPE` (`'email-change'`): confirms the requested `user.pendingEmail`.
  - `EMAIL_CHANGE_UNDO_TOKEN_TYPE` (`'email-change-undo'`): undoes an email change, mailed to the old address.
  - `MFA_CHALLENGE_TOKEN_TYPE` (`'mfa-challenge'`): a login's second-factor challenge.
  - `DELETION_RESTORE_TOKEN_TYPE` (`'deletion-restore'`): claim check given at sign-in to an account in its deletion grace, redeemed once at `POST /account/login/restore`.
  - `OAUTH_LINK_TOKEN_TYPE` (`'oauth-link'`): tells the OAuth callback which signed-in account is connecting a provider.
- **TTLs**:
  - `OAUTH_LINK_TTL_MS`: 5 minutes.
  - `EMAIL_CHANGE_UNDO_TTL_MS`: 7 days.
  - Both are built from `MINUTE_MS` and `DAY_MS` in `@domain-primitives/time`.
- `VERIFICATION_TOKEN_TYPES`: the `as const` tuple of all kinds, which is the schema's closed `enum`. New kinds are added here.
- `VerificationTokenType`: the union type derived from that tuple.
- `ONE_LIVE_TOKEN_TYPES`: the kinds limited to one live link per account. Issuing a new one replaces the old. The schema's partial unique index covers exactly these kinds, so the replacement is a single atomic upsert.

## Relationships
- Imports `DAY_MS` and `MINUTE_MS` from `src/domain-primitives/time.ts`.
- The doc comments say the schema uses `VERIFICATION_TOKEN_TYPES` for its enum and `ONE_LIVE_TOKEN_TYPES` for its partial unique index. `src/modules/account/model.ts` and `src/modules/account/repository.ts` are the likely places for this.
- `src/modules/account/services/revocation.ts` purges pending tokens using a `PENDING_TOKEN_TYPES` set. That set deliberately omits `ACCOUNT_RESTORE_TOKEN_TYPE` and `EMAIL_CHANGE_UNDO_TOKEN_TYPE`.
- Issuing and redeeming flows use these constants: `account-deletion`, `deletion-sign-in`, `email-change`, `oauth`, `password-reset-request`, `password-reset`, `verification`, `two-factor-challenge` and `tokens`. `previous-email-cleanup` and `src/modules/account/services/index.ts` are also neighbors in the graph.

## Notes
- `EMAIL_CHANGE_TOKEN_TYPE` is deliberately separate from `EMAIL_VERIFY_TOKEN_TYPE`. Reusing one type would let a signup-verify token swap in a `pendingEmail`, which the file calls an account-takeover risk.
- `MFA_CHALLENGE_TOKEN_TYPE` and `DELETION_RESTORE_TOKEN_TYPE` are not in `ONE_LIVE_TOKEN_TYPES`, so several can be in flight at once.
- Adding a new kind means updating `VERIFICATION_TOKEN_TYPES`, and `ONE_LIVE_TOKEN_TYPES` if it should be single-live.
- The omission of the restore and undo types from the revocation set is intentional. A password reset or change must not remove the way back from a deletion or an email change.
