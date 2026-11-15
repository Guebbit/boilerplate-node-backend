---
source: src/modules/account/rate-limits.ts
sha256: 572efbcf0a2f58b89f84cafb35cf49dc197ed8a8b8f44c056c75ddd832ce9fb5
generated_at: 2026-11-14T18:40:13.768483+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/rate-limits.ts

## Purpose

Defines the account module's rate-limit budgets as `RateLimitBudget` data objects and converts them into Express middleware via `buildRateLimiter`. It covers four distinct abuse surfaces: credential guessing (public and signed-in), password-strength lookups, Sybil signups/resets, and MFA challenges. Numeric thresholds live in `rate-limits.generated`; this file only wires keying, skip logic, and escalation policy.

## Key elements

- **`credentialLimiters: RequestHandler[]`** — Four limiters (identity, device-cookie, address, address-block) shared by all public password/token routes. Only failures spend budget; the identity limiter skips requests whose body names no account or that carry a valid device cookie.
- **`signedInCredentialLimiters: RequestHandler[]`** — Same shared trio plus a per-`accountIdOf` identity budget for `POST /account/password` and `/reauth`. No device-cookie skip (the session is the proof).
- **`SHARED_CREDENTIAL_LIMITERS`** (internal) — The device, address, and block limiters extracted so both exported arrays reference identical counters.
- **`loginChallengeGate: RequestHandler`** — Sits between `credentialLimiters` and the handler; delegates to `humanChallengeGate` once either the identity or block budget has ≥ 50 % failures recorded.
- **`passwordCheckLimiters: RequestHandler[]`** — Address + block limiters for `POST /account/password/check`. Every request counts (no `skipSuccessfulRequests`) because a 200 is the attacker's goal.
- **`signupLimiters: RequestHandler[]`** — Identity (submitted email), address, and block limiters. Success *is* the abuse, so all requests count.
- **`resetRequestLimiters`** / **`mfaChallengeLimiter`** / **`mfaSendLimiter`** — Same pattern for the remaining budgets (content truncated beyond the reset identity budget).
- **`credentialAttemptSucceeded(request, response)`** (internal) — Treats a response as successful only if `response.statusCode < 400` *and* `request.credentialAttemptFailed` is not set, so OAuth 302 redirects that are actually failures still spend budget.
- **`namesAnAccount(request)`** (internal) — True when the body carries `email` or `username`; gates the per-account identity budget.
- **`budgetMostlySpent(request, property)`** (internal) — Reads the express-rate-limit info object (falling back to the in-memory `failoverStore` during Redis outages) and compares prior hits against 50 % of the limit.
- **`IDENTITY_RATE_LIMIT_PROPERTY` / `BLOCK_RATE_LIMIT_PROPERTY`** — Custom `requestPropertyName` values so chained limiters don't overwrite each other's info on `request`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Provides `buildRateLimiter`, key-generator helpers (`identityOf`, `addressBlockOf`, `accountIdOf`), `readBodyField`, `rateLimitInfoOf`, `priorHits`, and the `KEYED_BY_*` label constants. This file is a primary consumer of that factory.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — `loginChallengeGate` calls `humanChallengeGate` as the escalation action when budget is half-spent.
- **`src/modules/account/session/device-cookie.ts`** — `holdsDeviceCookie` and `presentsFailingDeviceCookie` gate the device-budget skip logic on the credential identity limiter.
- **`src/modules/account/oauth/mfa-redirect.ts`** — `readMfaChallengeCookie` is imported (used by the MFA limiter section, truncated).
- **`src/modules/account/mail-budget.ts`** — `MAIL_RECIPIENT_BUDGET` is imported; the canonical-mailbox budget in that file complements the signup identity budget here.
- **`src/infrastructure/security/pseudonymise.ts`** — `pseudonymise` is imported for key normalisation (pseudonymised identifiers in rate-limit keys).
- **`src/types/index.ts`** — Re-exports the `RateLimitBudget` type used by every budget constant here.
- **`src/types/rate-limit-budget.ts`** — Defines the `RateLimitBudget` interface consumed by every budget constant here.
- **`src/modules/account/module.ts`** — Declares the `rateLimits` field on the account module; these budgets are registered there.
- **`src/modules/account/routes.ts`** — Mounts the exported limiter arrays and `loginChallengeGate` on the relevant Express routes.
- **`src/modules/account/tests/unit/rate-limits.test.ts`**, **`src/modules/account/tests/integration/identity-rate-limit.test.ts`**, **`src/modules/account/tests/integration/device-cookie-budget.test.ts`**, **`src/modules/account/tests/integration/auth-hardening.test.ts`** — Cover the skip logic, shared-counter behaviour, challenge-gate threshold, and hardening edge cases.

## Notes

- **Success vs. failure counting is intentional and asymmetric.** Credential limiters use `skipSuccessfulRequests` (only wrong guesses count); signup and reset limiters do *not* (a 201/200 *is* the abuse). Applying the wrong shape to a route silently breaks its protection.
- **`credentialAttemptSucceeded` exists because of OAuth.** A 302 redirect from an OAuth callback can be a *failure* (wrong password) that looks like success to express-rate-limit. The `request.credentialAttemptFailed` flag must be set by the handler; without it, redirected failures refund the budget.
- **Chained limiters overwrite each other's info by default.** The two custom `requestPropertyName` constants (`credentialIdentityRateLimit`, `credentialBlockRateLimit`) prevent this; `loginChallengeGate` reads those specific properties.
- **The identity budget skips valid device cookies but the signed-in set does not.** In the signed-in path the session token is the proof; a device cookie adds no extra signal and must not excuse the attempt.
- **`+tag` email addresses get fresh identity buckets on signup** (keyed on the raw submitted string). The address/block budgets and the canonical-mailbox budget in `mail-budget.ts` are the actual backstop.
- **Numeric values are generated.** Do not edit limits here; change `rate-limits.generated` (or its generator) instead.
