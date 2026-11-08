---
source: src/modules/account/rate-limits.ts
sha256: b3fef0513186c9ef01e429a7f9d6b68b564b3cbbb512fc15b635124699bf57b3
generated_at: 2026-11-08T04:14:35.644813+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/rate-limits.ts

## Purpose

Declares the account module's rate-limit budgets as `RateLimitBudget` objects and wires them into Express middleware arrays via `buildRateLimiter`. It covers four credential-guess dimensions, Sybil-shaped signup/reset budgets, a password-check advisory budget, and two MFA challenge budgets. This file is pure configuration + composition; the actual counting lives in the shared `rate-limit` middleware.

## Key elements

- **`credentialLimiters`** (exported) — Middleware array for public credential routes (login, token confirms, 2FA login, OAuth). Chains a per-account identity limiter (skipped when the body names no account or a valid device cookie is present) with the shared device / address / address-block limiters. All use `skipSuccessfulRequests: true`.
- **`sessionCredentialLimiters`** (exported) — Same shared limiters, but the identity budget is keyed on the authenticated session ID (`accountIdOf`) instead of a body field. Used by routes that run `isAuth` first and re-prove the caller.
- **`passwordCheckLimiters`** (exported) — Per-address and per-block budgets for `POST /account/password/check`. Does **not** skip successful requests because a 200 response is itself the exploitable side-effect (HIBP lookup).
- **`signupLimiters`** (exported) — Identity (submitted email), address, and block budgets. No `skipSuccessfulRequests`: the 201 *is* the Sybil abuse.
- **`resetRequestLimiters`** (exported) — Same three dimensions as signup; the route always returns 200 so success-path budgeting is the only effective bound.
- **`mfaChallengeLimiter` / `mfaSendLimiter`** (exported) — Two MFA-specific budgets (truncated in source; declared per the module doc-comment).
- **`loginChallengeGate`** (exported) — Middleware mounted between `credentialLimiters` and the login handler. Passes through while both the identity and block budgets are < 50 % spent; delegates to `humanChallengeGate` once either crosses the threshold.
- **`SHARED_CREDENTIAL_LIMITERS`** (internal) — The device-cookie, address, and block limiters shared by both `credentialLimiters` and `sessionCredentialLimiters` so a single caller spends one counter regardless of which route fails.
- **`namesAnAccount`** (internal) — Predicate: does the body carry an `email` or `username`? Gates the identity budget so token-only requests (reset links, 2FA codes, OAuth callbacks) do not pollute the per-account bucket.
- **`budgetMostlySpent`** (internal) — Reads `rateLimitInfoOf` for a given request property and returns true when `priorHits ≥ limit × 0.5`.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — Provides `buildRateLimiter`, `identityOf`, `addressBlockOf`, `readBodyField`, `rateLimitInfoOf`, `priorHits`, the `KEYED_BY_*` labels, and `accountIdOf`. Every budget in this file is materialised through that factory.
- **`@infrastructure/http/middlewares/human-challenge`** — `loginChallengeGate` delegates to `humanChallengeGate` when a budget is ≥ 50 % spent.
- **`@infrastructure/security/pseudonymise`** — Imported (likely used by `identityOf` under the hood, or available for key normalisation).
- **`./mail-budget`** — Exports `MAIL_RECIPIENT_BUDGET`, a canonical-mailbox budget that supplements the `+tag`-bypassable identity budget on signup.
- **`./oauth/mfa-redirect`** — Provides `readMfaChallengeCookie` used by the MFA limiter logic.
- **`./session/device-cookie`** — Provides `holdsDeviceCookie` (skips identity budget for a valid cookie) and `presentsFailingDeviceCookie` (gates the device-budget counter).
- **`./rate-limits.generated`** — Source of the numeric thresholds (`accountRateLimitData.*`); this file only adds keying strategy, skip predicates, and escalation shape.
- **`./routes.ts` / `./module.ts`** — Routes mount the exported limiter arrays; `module.ts` declares the `rateLimits` data object that feeds the generated file.
- **`@types` / `@types/rate-limit-budget`** — The `RateLimitBudget` type that every budget literal in this file conforms to.
- **Tests** — `rate-limits.test.ts` (unit), `identity-rate-limit.test.ts`, `auth-hardening.test.ts`, `device-cookie-budget.test.ts` (integration) exercise the budgets defined here.

## Notes

- `credentialLimiters` and `sessionCredentialLimiters` share `SHARED_CREDENTIAL_LIMITERS` by reference; a caller hitting either set spends the same address/block counters. Do not apply both arrays to the same route.
- `skipSuccessfulRequests: true` on credential limiters means a shared office IP or CI runner will never be locked out by correct logins. The signup/reset limiters intentionally omit this flag.
- `IDENTITY_RATE_LIMIT_PROPERTY` and `BLOCK_RATE_LIMIT_PROPERTY` are non-default `requestPropertyName` values so that, when four limiters chain, each writes its own info onto `req` without overwriting the others. `loginChallengeGate` reads both.
- The identity budget's `skip` predicate also checks `holdsDeviceCookie`; a valid device cookie exempts the caller from the per-account counter but NOT from the address/block counters.
- `CHALLENGE_AFTER_BUDGET_SPENT` is hardcoded to 0.5; there is no per-budget override.
- The file imports from `./rate-limits.generated` — that file is produced by a build/codegen step, not hand-edited. Change thresholds in the generator source, not here.
