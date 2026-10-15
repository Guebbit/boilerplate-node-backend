---
source: src/modules/account/rate-limits.ts
sha256: 0a04560cfcbe2266a13fa172ea304dcd3b9991a1cba2b9481eaea8028eba02bb
generated_at: 2026-10-15T09:58:24.900661+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/rate-limits.ts

## Purpose

Defines the account module's rate-limit budgets as `RateLimitBudget` data objects and turns them into Express middleware via `buildRateLimiter`. Covers credential-guess protection (per-account, per-address, per-address-block, per-session, per-device-cookie), a password-strength check limiter, signup/reset/MFA budgets (truncated in view), and the `loginChallengeGate` that escalates to a human challenge once a budget is half-spent.

## Key elements

- **`credentialLimiters`** (exported `RequestHandler[]`) — the full chain for public auth routes: per-account identity budget + shared address/device/block limiters. Only failures spend the budget (`skipSuccessfulRequests`); requests naming no account skip the identity bucket.
- **`sessionCredentialLimiters`** (exported `RequestHandler[]`) — same shared limiters but with `SESSION_CREDENTIAL_BUDGET` keyed on the authenticated account ID instead of a body field, for routes that re-prove an already-signed-in caller.
- **`loginChallengeGate`** (exported `RequestHandler`) — sits between `credentialLimiters` and the login handler; delegates to `humanChallengeGate` when the identity or address-block budget is ≥ 50 % spent.
- **`passwordCheckLimiter`** (exported `RequestHandler`) — limiter for `POST /account/password/check`; counts *every* request (not just failures) because a 200 response is itself the amplifier.
- **`CREDENTIAL_WINDOW_MS`** — 15-minute window shared by all credential budgets (distinct from the shared 1-minute browsing window).
- **`SHARED_CREDENTIAL_LIMITERS`** — the device-cookie, address, and address-block limiters, built once and spread into both credential arrays so a single address/block spends one counter across all credential routes.
- **`namesAnAccount`** — predicate: returns true if the request body contains an `email` or `username` field; gates whether the per-account identity budget counts the request.
- **`budgetMostlySpent`** — reads `rateLimitInfoOf` for a given property name and compares `priorHits` against 50 % of the limit; used by `loginChallengeGate`.
- **`IDENTITY_RATE_LIMIT_PROPERTY` / `BLOCK_RATE_LIMIT_PROPERTY`** — distinct `requestPropertyName` values so the chained limiters don't overwrite each other's info on `req`.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — supplies `buildRateLimiter`, `identityOf`, `addressBlockOf`, `readBodyField`, `rateLimitInfoOf`, `priorHits`, the `KEYED_BY_*` label constants, and `accountIdOf`. Every budget in this file is materialised through `buildRateLimiter`.
- **`@infrastructure/http/middlewares/human-challenge`** — `loginChallengeGate` calls `humanChallengeGate` when a budget threshold is crossed.
- **`@infrastructure/security/pseudonymise`** — `CREDENTIAL_DEVICE_BUDGET`'s `skip` predicate calls `presentsFailingDeviceCookie`; the identity budget's key uses `identityOf` which normalises/pseudonymises the submitted account name.
- **`./services/two-factor-challenge`** — provides `MFA_CHALLENGE_DELIVERED_TTL_MS`, used by the MFA challenge budget (truncated).
- **`./mail-budget`** — provides `MAIL_RECIPIENT_BUDGET`, referenced by the reset-request limiter (truncated).
- **`./oauth/mfa-redirect`** — provides `readMfaChallengeCookie`, used by the MFA limiter (truncated).
- **`./session/device-cookie`** — provides `holdsDeviceCookie` and `presentsFailingDeviceCookie`; the former exempts the identity budget (a valid cookie means the owner is not a guesser), the latter is the *only* trigger for `CREDENTIAL_DEVICE_BUDGET`.
- **`./module.ts`** — declares `rateLimits` on the account module where the `RateLimitBudget` objects are registered for runtime resolution.
- **`./routes.ts`** — consumes `credentialLimiters`, `sessionCredentialLimiters`, `loginChallengeGate`, and `passwordCheckLimiter` as Express middleware on the relevant route handlers.
- **`src/types/rate-limit-budget.ts`** — defines the `RateLimitBudget` interface that every constant in this file implements.
- **Tests** — `rate-limits.test.ts` (unit), `identity-rate-limit.test.ts`, `auth-hardening.test.ts`, and `device-cookie-budget.test.ts` (integration) exercise the budgets and the challenge gate.

## Notes

- The three credential limiters are **chained, not combined**: a single address or block burns one counter on whichever route fails, but the *identity* budget is independent. Keying on a tuple of (address, account) would be weaker because refreshing one leg refreshes the bucket.
- `skipSuccessfulRequests: true` on every credential budget means a shared CI/office IP is never locked out by people getting the password right. The password-check budget is the exception — it counts successes because a 200 *is* the DoS vector.
- The per-account identity budget has `escalation: { doublings: 3 }`, so repeated lockouts of the same account last up to 8× the base window.
- `CREDENTIAL_DEVICE_BUDGET` only counts requests that **present a failing device cookie** (cookie exists but does not vouch for the named account). A request with no cookie, or a valid cookie, is invisible to this budget.
- `loginChallengeGate` reads two distinct `requestPropertyName` values because the default express-rate-limit behaviour would let the last limiter in the chain overwrite the first's info on `req`.
- The file's module doc-comment references `docs/tools/security.md#the-rate-limit-budgets` as the design rationale.
