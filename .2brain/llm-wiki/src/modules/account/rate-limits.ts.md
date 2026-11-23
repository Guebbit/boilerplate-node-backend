---
source: src/modules/account/rate-limits.ts
source_sha256: ab780e4e6c90ab4822b6be293bf8f203f93db40e1a076b51de0660f46c5f76c5
context_sha256: bfaa53e32cca7835d647539c776a4c0fd64ff67991c052aad9b0e5ce02945f36
generated_at: 2026-11-22T03:34:10.410152+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/rate-limits.ts

## Purpose
Declares the account module's rate-limit budgets and turns them into Express middleware arrays. It covers credential-guessing (login, token confirms, second-factor login, OAuth), signup, password-reset requests, the password-strength check, and the MFA challenge budgets. Each budget is a `RateLimitBudget` data object, built into middleware by the shared `buildRateLimiter` factory. Numeric limits come from `./rate-limits.generated` (`accountRateLimitData`); this file adds the keying, skip and success rules.

## Key elements
- **`credentialLimiters`**: limiter array for public credential routes. It holds the per-account identity budget (counts only when the body names an `email` or `username`, and is skipped when the caller holds a device cookie), plus the shared device, address and address-block limiters.
- **`signedInCredentialLimiters`**: the same shape for routes that run `isAuth` first (`POST /account/password`, `/reauth`). The per-account bucket is keyed on the authenticated account id (`accountIdOf`), never a body field, and a device cookie never excuses it.
- **`SHARED_CREDENTIAL_LIMITERS`** (internal): device-cookie, address and address-block limiters, built once so each address or block spends one counter across all credential routes.
  - The device budget counts only requests that present a failing (forged or stale) device cookie.
  - The address and block budgets use `credentialAttemptSucceeded`, so an OAuth failure that redirects is still counted via `request.credentialAttemptFailed`.
- **`loginChallengeGate`**: middleware placed between `credentialLimiters` and the login handler. It calls `humanChallengeGate` once the identity budget or the address-block budget is at least half spent (`CHALLENGE_AFTER_BUDGET_SPENT = 0.5`). Otherwise it calls `next()`.
- **`passwordCheckLimiters`**: per-address and per-block budgets for `POST /account/password/check`. Every request counts, because the endpoint may trigger an outbound HIBP lookup.
- **`signupLimiters`**: identity (submitted email), address and block budgets. None skip success, so successful signups (Sybil accounts) spend the budget.
- **Reset-request budgets**: `RESET_IDENTITY_BUDGET` and following definitions (identity keyed on the submitted email; the rest of the file is not shown here). The module doc also names `resetRequestLimiters`, `mfaChallengeLimiter` and `mfaSendLimiter`.
- **Separate property names**: `IDENTITY_RATE_LIMIT_PROPERTY` (`credentialIdentityRateLimit`) and `BLOCK_RATE_LIMIT_PROPERTY` (`credentialBlockRateLimit`). Each stores its limiter's info on the request so the limiters don't overwrite each other.

## Relationships
- **`src/infrastructure/http/middlewares/rate-limit.ts`**: supplies `buildRateLimiter`, the key generators (`identityOf`, `addressBlockOf`, `accountIdOf`), `KEYED_BY_*` labels, and helpers (`readBodyField`, `rateLimitInfoOf`, `priorHits`).
- **`src/infrastructure/http/middlewares/human-challenge.ts`**: `loginChallengeGate` delegates to `humanChallengeGate`.
- **`src/modules/account/session/device-cookie.ts`**: `holdsDeviceCookie` and `presentsFailingDeviceCookie` drive the skip rules.
- **`src/modules/account/oauth/mfa-redirect.ts`**: imports `readMfaChallengeCookie`, used by the MFA budgets in the part of the file not shown here.
- **`src/modules/account/mail-budget.ts`**: imports `MAIL_RECIPIENT_BUDGET`. The signup doc also refers to this canonical-mailbox budget as a backstop for `+tag` variants.
- **`src/infrastructure/security/pseudonymise.ts`**: imported for `pseudonymise`, used in the part of the file not shown here.
- **`src/types/index.ts`** and **`src/types/rate-limit-budget.ts`**: provide the `RateLimitBudget` type (imported from `@types`).
- **Tests**: `src/modules/account/tests/unit/rate-limits.test.ts`, `src/modules/account/tests/integration/auth-hardening.test.ts`, `src/modules/account/tests/integration/device-cookie-budget.test.ts` and `src/modules/account/tests/integration/identity-rate-limit.test.ts` cover the budgets.

## Notes
- Limiters are exported as arrays because Express flattens them, so a route can't apply only part of a set.
- Credential budgets use `skipSuccessfulRequests`, so only failures spend them and shared addresses (offices, CI) aren't locked out. Signup and password-check budgets count every request.
- Trade-off: the signed-in budget is per account across all sessions, so a stolen session that exhausts it also blocks the owner's other sessions. A fresh login, which isn't counted, is enough for `DELETE /account/sessions`.
- The identity budget is not applied when the body names no account (such as token-only confirms). Keying those would put every neighbour in a /24 into one bucket.
- The identity budget has `escalation: { doublings: 3 }`.
- During a Redis outage the budgets count in memory (`failoverStore`), and `loginChallengeGate` reads those fallback numbers.
- If a limiter hasn't run, its rate-limit info is missing and reads as "not yet spent".
