---
source: src/modules/account/rate-limits.ts
sha256: 15f047975a39c38073a2e4e2baba693a22fb34ea23dfe0e8cb31b0e8d34944fe
generated_at: 2026-10-14T08:45:30.583349+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/rate-limits.ts

## Purpose

Defines all account-module rate-limit budgets (credential guesses, signups, password checks, reset requests, MFA challenges) as `RateLimitBudget` data objects and converts them into Express middleware via `buildRateLimiter`. It is the single place where the account module decides *who* is throttled, *how many* attempts are allowed, and *when* a human challenge kicks in.

## Key elements

- **`credentialLimiters: RequestHandler[]`** — Four chained limiters (per-account, failing-device-cookie, per-address, per-address-block) for password/token endpoints. All use `skipSuccessfulRequests: true`; only failures spend the budget. Exported as an array so a route applies the full set atomically.
- **`loginChallengeGate: RequestHandler`** — Sits *between* `credentialLimiters` and the login handler. Passes through while the account's failure budget is >50 % unspent; delegates to `humanChallengeGate` once it is not.
- **`passwordCheckLimiter: RequestHandler`** — Single limiter for `POST /account/password/check`. Counts every request (no `skipSuccessfulRequests`) because each call may trigger an outbound HIBP lookup.
- **`signupLimiters: RequestHandler[]`** — Per-email, per-address, per-address-block limiters for `POST /account/signup`. Count successful requests (the 201 *is* the Sybil abuse), unlike credential budgets.
- **`resetRequestLimiters`**, **`mfaChallengeLimiter`**, **`mfaSendLimiter`** — Additional budgets (truncated in source) for password-reset and MFA flows.
- **`credentialIdentityOf(request)`** — Custom key generator: uses `account:<id>` when `request.authContext` exists, otherwise falls back to `identityOf` (normalised/pseudonymised submitted email → address block).
- **`IDENTITY_RATE_LIMIT_PROPERTY`** — Custom `requestPropertyName` so the identity limiter's counter on `req` is not overwritten by the other three chained limiters.
- **`CREDENTIAL_WINDOW_MS`** — 15-minute window, deliberately longer than the shared 1-minute browsing window.
- **`CHALLENGE_AFTER_IDENTITY_BUDGET_SPENT`** — `0.5` threshold: challenge gate activates once ≥50 % of the per-account budget is spent.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Source of `buildRateLimiter`, `identityOf`, `addressBlockOf`, `rateLimitInfoOf`, `KEYED_BY_*` constants, and `accountIdOf`. Every budget in this file is turned into middleware by that factory.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — `loginChallengeGate` delegates to `humanChallengeGate` when the identity budget is mostly spent.
- **`src/modules/account/session/device-cookie.ts`** — `holdsDeviceCookie` skips the identity budget (familiar device); `presentsFailingDeviceCookie` gates the device-cookie budget.
- **`src/modules/account/services/two-factor-challenge.ts`** — Provides `MFA_CHALLENGE_DELIVERED_TTL_MS` for MFA budget configuration.
- **`src/modules/account/oauth/mfa-redirect.ts`** — Provides `readMfaChallengeCookie` for MFA-related limiters.
- **`src/modules/account/mail-budget.ts`** — `MAIL_RECIPIENT_BUDGET` is imported, likely to align reset-request limiter windows.
- **`src/modules/account/routes.ts`** — Consumes `credentialLimiters`, `loginChallengeGate`, `passwordCheckLimiter`, `signupLimiters`, etc. on the account routes.
- **`src/modules/account/module.ts`** — The file's doc comment states budgets are "declared on `./module.ts`'s `rateLimits`"; this file is the data + middleware layer behind that declaration.
- **`src/types/index.ts` / `src/types/rate-limit-budget.ts`** — Source of the `RateLimitBudget` type and `KEYED_BY_*` labels.
- **`src/modules/account/tests/unit/rate-limits.test.ts`**, **`identity-rate-limit.test.ts`**, **`auth-hardening.test.ts`**, **`device-cookie-budget.test.ts`** — Unit and integration coverage for the budgets and gates defined here.

## Notes

- **Array export is load-bearing.** `credentialLimiters` (and `signupLimiters`) are exported as arrays because Express flattens middleware arrays; a route cannot pick a subset. Treat them as a unit.
- **Credential vs. signup polarity is inverted.** Credential budgets use `skipSuccessfulRequests: true` (only failures count). Signup and password-check budgets count *every* request because the successful response is the abuse vector (Sybil accounts / HIBP amplification).
- **Mounting order matters.** `loginChallengeGate` reads the identity limiter's counter via `IDENTITY_RATE_LIMIT_PROPERTY`; it must run *after* `credentialLimiters` and *before* the handler. Placing it elsewhere reads stale or missing info.
- **Escalation on repeat lockout.** The identity budget has `escalation: { doublings: 3 }`, so a repeat lockout lasts up to 8× the base window.
- **Redis failover.** `identityBudgetMostlySpent` reads whatever store `express-rate-limit` is using (Redis or in-memory `failoverStore`), so the challenge gate degrades gracefully during a Redis outage.
