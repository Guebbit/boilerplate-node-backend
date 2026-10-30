---
source: src/modules/account/rate-limits.ts
sha256: 5b5235ed42f6efea091eb514576886b8cbb83041e45cbf69f99cd0a8647bbf59
generated_at: 2026-10-29T02:38:25.119504+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/rate-limits.ts

## Purpose

Defines the account module's rate-limit budgets and the Express middleware arrays that enforce them. Covers four credential-guess dimensions (per-account, per-device, per-address, per-address-block), two success-spent Sybil budgets (signup, password-reset-request), a password-strength advisory budget, and two MFA challenge budgets. Each budget is a `RateLimitBudget` object built from generated data in `rate-limits.generated.ts` and turned into a limiter via `buildRateLimiter`.

## Key elements

- **`credentialLimiters`** — Four-limiters array (identity → device → address → block) for public login/token/OAuth routes. Only failures spend the budget (`skipSuccessfulRequests`).
- **`sessionCredentialLimiters`** — Same shared limiters plus a session-keyed identity budget (`accountIdOf`) for re-auth routes that run `isAuth` first and re-prove the caller.
- **`loginChallengeGate`** — Middleware that checks whether the identity or block budget is ≥ 50 % spent and, if so, delegates to `humanChallengeGate`; otherwise passes through.
- **`passwordCheckLimiters`** — Per-address and per-block limiters for `POST /account/password/check`. No `skipSuccessfulRequests` because a 200 response *is* the abuse vector (free HIBP lookups).
- **`signupLimiters`** — Identity (submitted email), address, and block budgets. Counts successes, not failures, because Sybil account creation is the abuse.
- **`resetRequestLimiters`** — Same three dimensions as signup; the route always returns 200, so abuse is entirely on the success path.
- **`mfaChallengeLimiter` / `mfaSendLimiter`** — Two MFA challenge budgets (file truncated before full definitions).
- **`namesAnAccount`** (internal) — Predicate: does the request body carry an `email` or `username`? Controls whether the per-account identity budget applies.
- **`SHARED_CREDENTIAL_LIMITERS`** (internal) — Device, address, and block limiters shared between `credentialLimiters` and `sessionCredentialLimiters` so a caller spends one counter across all credential routes.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Provides `buildRateLimiter`, key generators (`identityOf`, `addressBlockOf`, `accountIdOf`), `readBodyField`, `rateLimitInfoOf`, `priorHits`, and the `KEYED_BY_*` label constants used by every budget here.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — `loginChallengeGate` delegates to `humanChallengeGate` once a budget threshold is met.
- **`src/infrastructure/security/pseudonymise.ts`** — `pseudonymise` is imported (used by `identityOf` upstream; available for key generation).
- **`src/modules/account/rate-limits.generated.ts`** — Supplies the numeric limit/doubling data (`accountRateLimitData.*`) that each budget spreads into its `RateLimitBudget` object.
- **`src/modules/account/mail-budget.ts`** — Exports `MAIL_RECIPIENT_BUDGET`, imported here (likely referenced in signup or reset context).
- **`src/modules/account/session/device-cookie.ts`** — `holdsDeviceCookie` / `presentsFailingDeviceCookie` gate the identity and device credential budgets.
- **`src/modules/account/oauth/mfa-redirect.ts`** — `readMfaChallengeCookie` imported for MFA limiter keying.
- **`src/modules/account/routes.ts`** — Consumes the exported limiter arrays on the relevant route definitions.
- **`src/types/rate-limit-budget.ts`** — Declares the `RateLimitBudget` interface used throughout.
- **`src/modules/account/tests/unit/rate-limits.test.ts`** and integration tests (`identity-rate-limit.test.ts`, `auth-hardening.test.ts`, `device-cookie-budget.test.ts`) — Cover the budgets' skip logic, challenge escalation, and device-cookie interaction.

## Notes

- **Identity budget skip logic**: `CREDENTIAL_IDENTITY_BUDGET` skips requests that do not name an account in the body *or* that carry a valid device cookie. A blank email/username files under the address-block budget instead, avoiding shared /24 collisions for token-only confirms.
- **Session routes never key on body fields**: `SESSION_CREDENTIAL_BUDGET` uses `accountIdOf` exclusively because those routes validate *after* the limiter; a body-injected `email` would otherwise rotate the bucket.
- **`requestPropertyName` disambiguation**: `credentialLimiters` chains four limiters; without distinct property names each limiter's info overwrites the last. `IDENTITY_RATE_LIMIT_PROPERTY` and `BLOCK_RATE_LIMIT_PROPERTY` exist solely so `loginChallengeGate` can read the correct counter.
- **Challenge threshold is 50 %**: `loginChallengeGate` triggers at half the budget, not on the first or second mistyped password, but before a script can spend the remainder unchallenged.
- **Redis failover**: During a Redis outage the budget counts in memory (`failoverStore`); `budgetMostlySpent` reads whatever store is active, so the gate does not go blind.
- **`+tag` emails**: The signup identity budget keys on the raw submitted string, so `user+tag@example.com` gets a fresh bucket. The address, block, and canonical-mailbox budgets (`mail-budget.ts`) still bound the caller.
