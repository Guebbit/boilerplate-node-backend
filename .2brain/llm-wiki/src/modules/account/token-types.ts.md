---
source: src/modules/account/token-types.ts
sha256: 66a89d8d500b80e91502e92ba22b759740336decba2ebc1ebd0bdc3472c2a34a
generated_at: 2026-10-14T14:47:45.065935+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/token-types.ts

## Purpose

Leaf module that defines the closed set of `type` values the account module stores in `verificationtokens`. It exists so the DB schema, the issuing flows, and the revocation service can all reference the same token-type names and the one-LIVE constraint without importing one another (and without creating cycles).

## Key elements

- **`PASSWORD_RESET_TOKEN_TYPE`** (`'password'`) — type for password-reset / account-setup links.
- **`ACCOUNT_DELETE_TOKEN_TYPE`** (`'delete'`) — type for account-deletion confirmation links.
- **`EMAIL_VERIFY_TOKEN_TYPE`** (`'verify'`) — type for signup / re-send verification (proves the address the account *already* has).
- **`EMAIL_CHANGE_TOKEN_TYPE`** (`'email-change'`) — type for email-change confirmation (proves the *pending* address). Deliberately distinct from `EMAIL_VERIFY_TOKEN_TYPE`.
- **`EMAIL_CHANGE_UNDO_TOKEN_TYPE`** (`'email-change-undo'`) — type for the undo link mailed to the old address.
- **`MFA_CHALLENGE_TOKEN_TYPE`** (`'mfa-challenge'`) — type for the two-factor challenge link.
- **`EMAIL_CHANGE_UNDO_TTL_MS`** — 7-day lifetime for the undo link.
- **`VERIFICATION_TOKEN_TYPES`** — `as const` array of all six types; used as the schema's closed `enum`.
- **`VerificationTokenType`** — union type derived from `VERIFICATION_TOKEN_TYPES[number]`.
- **`ONE_LIVE_TOKEN_TYPES`** — the subset for which the schema enforces a partial unique index (at most one live token per account). Excludes `ACCOUNT_DELETE_TOKEN_TYPE` and `MFA_CHALLENGE_TOKEN_TYPE`, which may have several in flight.

## Relationships

- **`src/modules/account/model.ts`** — consumes `VERIFICATION_TOKEN_TYPES` as the column `enum` and `ONE_LIVE_TOKEN_TYPES` to build the partial unique index on `verificationtokens`.
- **`src/modules/account/services/revocation.ts`** — imports the type constants to purge stale tokens; intentionally omits `EMAIL_CHANGE_UNDO_TOKEN_TYPE` from its `PENDING_TOKEN_TYPES` list.
- **`src/modules/account/services/tokens.ts`** — issues tokens stamped with these constants.
- **`src/modules/account/services/two-factor-challenge.ts`** — references `MFA_CHALLENGE_TOKEN_TYPE` when creating challenge links.
- **`src/modules/account/services/email-change.ts`** — issues `EMAIL_CHANGE_TOKEN_TYPE` and `EMAIL_CHANGE_UNDO_TOKEN_TYPE`.
- **`src/modules/account/services/verification.ts`** — issues `EMAIL_VERIFY_TOKEN_TYPE`.
- **`src/modules/account/services/password-reset-request.ts`** / **`password-reset.ts`** — issue / consume `PASSWORD_RESET_TOKEN_TYPE`.
- **`src/modules/account/services/deletion-request.ts`** — issues `ACCOUNT_DELETE_TOKEN_TYPE`.
- **`src/modules/account/tests/factories.ts`** — uses the constants to build realistic token rows.
- **`src/modules/account/tests/unit/auth-schemas.test.ts`** — asserts the schema enum matches `VERIFICATION_TOKEN_TYPES`.

## Notes

- **`EMAIL_CHANGE` ≠ `EMAIL_VERIFY`.** Spending a `verify` token must not promote a `pendingEmail` (or vice-versa); conflating them is an account-takeover path. The two are separate constants on purpose.
- **Undo token survives password reset.** `EMAIL_CHANGE_UNDO_TOKEN_TYPE` is deliberately absent from `ONE_LIVE_TOKEN_TYPES`'s companion revocation list and from revocation's `PENDING_TOKEN_TYPES`; a password change must not revoke a link the user may still need.
- **Partial-unique, not full-unique.** Only the four `ONE_LIVE_TOKEN_TYPES` are subject to the "one live per account" index. Delete-confirmations and MFA challenges are explicitly *not* included because multiple may be in flight concurrently.
- **Leaf module.** It imports nothing from the account module (or elsewhere), which is the entire point of its existence — it breaks what would otherwise be circular imports between schema, services, and revocation.
- **Adding a new token type.** Append the constant, add it to `VERIFICATION_TOKEN_TYPES`, and (if it should be one-live) to `ONE_LIVE_TOKEN_TYPES`. The schema enum and index pick it up from those two arrays.
