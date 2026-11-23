---
source: src/modules/account/services/two-factor-challenge.ts
source_sha256: ca6b2483fc24144ed67d8463403d4b120f03313bc3c04eb00af3f950c9b765fa
context_sha256: fa013535e5010458624116a768db9b0153fbe49fa0fa704917f720bfb7a22739
generated_at: 2026-11-22T03:42:57.157583+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/two-factor-challenge.ts

## Purpose
Implements the second step of a 2FA login: building the challenge returned after the first factor succeeds, delivering a code against it, and verifying the code. It deliberately stops short of minting a session. The `post-login-2fa` controller (`src/modules/account/controllers/post-login-2fa.ts`) turns a verified challenge into cookies.

## Key elements
- `MFA_CHALLENGE_TTL_MS` – 5 minutes. Used when every armed factor is read off a device. Also exported for the deletion-restore claim check.
- `MFA_CHALLENGE_DELIVERED_TTL_MS` – 10 minutes. Used when any armed factor delivers a code, to cover mail delay. Exported so the rate-limit configuration can window the MFA challenge budgets to it.
- `buildLoginChallenge(user, amr)` – marked `@internal`, so it is kept off `twoFactorService`.
  - Picks the TTL from the user's armed entries and issues a token of type `MFA_CHALLENGE_TOKEN_TYPE` carrying `amr`.
  - Returns an `MfaChallenge`: `mfaRequired: true`, `challenge`, `expiresAt`, `methods` (via `summarize`) and `defaultMethod` (the first armed handler's name, if any).
- `sendLoginCode(challenge, method, context)` – `POST /account/login/2fa/send`.
  - Resolves the live challenge to a user, then calls `deliverArmedCode`.
  - An invalid challenge gives 401.
  - DB errors map through `rejectDatabaseEnvelope('auth', …)`.
  - The result is wrapped in `audited(...)` with `AUTH_2FA_CODE_SENT`.
- `VerifiedChallenge` – `{ user, amr }`, the result handed to `postLoginTwoFactor`.
- `verifyLoginChallenge(challenge, code, context)` – `POST /account/login/2fa`.
  - Finds the live challenge entry and returns 401 if it is missing, if the user has no `twoFactorEnabledAt`, or if the entry has no `amr`.
  - Otherwise it runs `verifyArmedFactor`, then `settleVerdict`, which on success calls `redeemChallenge`.
  - It records an `AUTH_2FA_CHALLENGE_FAILED` audit on any non-success result.
- `redeemChallenge` (private) – spends the challenge with `spendThen`. Only the request whose own write removed the token proceeds. It then persists the user's two-factor methods through `accountUserService` and returns `{ user, amr }`. A concurrent twin gets 401.

## Relationships
- `./tokens` – `issueToken`, `findLiveToken`, `findLiveTokenEntry` and `spendThen` provide the single-use, hashed-at-rest challenge token.
- `./two-factor-outcomes` – `armedEntries`, `summarize`, `deliverArmedCode` and `audited` supply armed-method handling and audit wrapping for delivery.
- `./two-factor-lockout` – `verifyArmedFactor` and `settleVerdict` do code verification and lockout handling.
- `src/infrastructure/http/response.ts` and `src/infrastructure/http/errors.ts` – `generateSuccess`/`generateReject` build the envelopes, and `rejectDatabaseEnvelope` maps DB failures.
- `src/infrastructure/i18n/index.ts` – `t(...)` provides the localized reject message for an invalid challenge.
- `src/infrastructure/observability/audit.ts` and `src/modules/account/audit.ts` – `recordAudit` and `accountAuditActions` record the audit events.
- `src/domain-primitives/time.ts` – `MINUTE_MS` is used for the TTL constants.
- Callers: `post-login.ts` and `get-oauth-callback.ts` are the login doors (per the `@internal` note on `buildLoginChallenge`), and `deletion-sign-in.ts` is referenced by the TTL constant's doc. `src/modules/account/services/index.ts` is also a neighbor. Their exact call sites are not shown in this file.

## Notes
- Failures return 401 for a missing, wrong-type or expired challenge and for an account without 2FA, so callers can't tell which case they hit.
- A wrong code leaves the challenge live. `mfaChallengeLimiter` bounds retries. A right code spends it.
- Success is not audited here. `postLoginTwoFactor` fires `AUTH_LOGIN` once a session exists. Only failures are audited from `verifyLoginChallenge`.
- `sendLoginCode` enforces the cooldown itself, not only in the route limiter, because it sends mail for an unauthenticated caller.
- A challenge without `amr` is refused rather than defaulted to a password proof.
