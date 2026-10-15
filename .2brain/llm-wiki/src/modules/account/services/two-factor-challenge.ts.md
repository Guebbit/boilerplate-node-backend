---
source: src/modules/account/services/two-factor-challenge.ts
sha256: dafce7ffb0405dbcd49e71e7b7df493e65b71ad5c790a8b7dfe8f437db14fca4
generated_at: 2026-10-15T10:03:36.880650+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-challenge.ts

## Purpose

Implements the three operations of the 2FA login challenge: **build** a single-use challenge after the first factor succeeds, **deliver** a code for one armed method, and **verify** a submitted code. It deliberately stops short of minting a session — `../controllers/post-login-2fa.ts` is responsible for turning a verified challenge into cookies.

## Key elements

- **`MFA_CHALLENGE_TTL_MS`** (300 s) — private TTL for challenges whose armed factors are all device-read (TOTP, etc.).
- **`MFA_CHALLENGE_DELIVERED_TTL_MS`** (600 s) — exported TTL for accounts with at least one *delivered* factor (email/SMS). Consumed by `rate-limits.ts` so a rate-limit window can never expire before the challenge it bounds.
- **`buildLoginChallenge(user, amr)`** — picks the TTL based on whether any armed handler `delivers`, issues a `MFA_CHALLENGE_TOKEN_TYPE` token via `issueToken`, and returns the `{ mfaRequired, challenge, expiresAt, methods, defaultMethod }` payload the controller sends to the client.
- **`sendLoginCode(challenge, method, context)`** — validates the challenge is live, calls `deliverArmedCode` for the named method, and wraps the result in an audit event (`AUTH_2FA_CODE_SENT`). Returns 401 if the challenge is missing/invalid.
- **`VerifiedChallenge`** — interface (`{ user, amr }`) returned on successful verification, handed to the controller for session minting.
- **`verifyLoginChallenge(challenge, code, context)`** — looks up the challenge entry, requires both `twoFactorEnabledAt` and a stored `amr` (refuses rather than defaulting to a password proof), verifies the code via `verifyArmedFactor` / `settleVerdict`, then **spends** the token. A concurrent duplicate is rejected. On success, persists updated two-factor methods and returns the verified user + amr. On failure, records an `AUTH_2FA_CHALLENGE_FAILED` audit event.

## Relationships

| Neighbor | Interaction |
|---|---|
| `services/tokens.ts` | `issueToken`, `findLiveToken`, `findLiveTokenEntry`, `spendLiveToken` — the single-use, hashed-at-rest token lifecycle for challenges. |
| `services/two-factor-outcomes.ts` | `armedEntries`, `summarize` (challenge build), `deliverArmedCode` (code delivery), `audited` (audit wrapper). |
| `services/two-factor-lockout.ts` | `verifyArmedFactor` (code check), `settleVerdict` (lockout bookkeeping before the spend). |
| `token-types.ts` | `MFA_CHALLENGE_TOKEN_TYPE` — the token-type discriminator used in every token call. |
| `modules/users/index.ts` | `userService.persistTwoFactorMethods` and the `UserDocument` type. |
| `account/audit.ts` | `accountAuditActions` enum values for the two audit events emitted here. |
| `infrastructure/observability/audit.ts` | `recordAudit` — fires the failure-only audit in `verifyLoginChallenge`. |
| `infrastructure/http/response.ts` | `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types. |
| `infrastructure/http/errors.ts` | `rejectDatabaseEnvelope` — uniform 500 envelope for unexpected DB errors. |
| `infrastructure/i18n/index.ts` | `t()` for user-facing error strings. |
| `account/rate-limits.ts` | Imports `MFA_CHALLENGE_DELIVERED_TTL_MS` to align its challenge-budget window with the challenge lifetime. |
| `services/index.ts` | Barrel re-export of this module's public API. |

## Notes

- **TTL is method-dependent.** If any armed factor has a `delivers` handler (email, SMS), the challenge gets the 600 s window; otherwise 300 s. The controller does not choose the TTL.
- **Single-use, not just single-read.** A correct code calls `spendLiveToken`; a concurrent twin that reads the same token first gets a 401 indistinguishable from an invalid challenge. A *wrong* code leaves the token live so the rate limiter (`mfaChallengeLimiter`) can still count attempts.
- **Audit is asymmetric.** `verifyLoginChallenge` records an audit event **only on failure**. The success path is audited later by `postLoginTwoFactor` as `AUTH_LOGIN` once a session actually exists — auditing success here would claim a login before one has happened.
- **`amr` is mandatory.** A challenge entry without a stored `amr` array is rejected outright (401, empty message) rather than silently defaulting to `['pwd']`.
- **`sendLoginCode` enforces cooldown at the service level**, not only via the route-level rate limiter, because it is a public (unauthenticated) endpoint that triggers outbound mail.
- **Challenge is not a JWT.** It uses the same single-use, revocable, hashed-at-rest `verificationtokens` mechanism as password-reset and account-deletion flows.
