---
source: src/modules/account/rate-limits.ts
sha256: 5d83ff4efd44f171a8fd1060516f74bbc5d5058c7d4d2917793f1d92d9ddef33
generated_at: 2026-09-23T18:07:49.222933+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/rate-limits.ts

## Purpose

Defines and exports all rate-limit middleware for the account module's credential-guessing, signup, password-reset, password-check, and MFA-challenge endpoints. Each budget is a `RateLimitBudget` data object turned into an Express `RequestHandler` via the shared `buildRateLimiter` factory, so the account module's security posture lives in one place rather than scattered across route handlers.

## Key elements

- **`credentialLimiters`** (`RequestHandler[]`) — three chained limiters (per-account, per-address, per-address-block) that count *failed* auth attempts only (`skipSuccessfulRequests: true`). Exported as an array so a route applies the full set atomically.
- **`loginChallengeGate`** (`RequestHandler`) — mounted between `credentialLimiters` and the login handler; delegates to `humanChallengeGate` once ≥ 50 % of the per-account identity budget is spent, otherwise passes through. Fails open (no challenge) if rate-limit info is absent.
- **`passwordCheckLimiter`** (`RequestHandler`) — single per-address limiter for `POST /account/password/check`; every request counts (no `skipSuccessfulRequests`) because a 200 validation response is itself the amplification target.
- **`signupLimiters`** (`RequestHandler[]`) — three chained limiters (per-email, per-address, per-address-block) that count *successful* signups; protects against Sybil account creation.
- **`resetRequestLimiters`** (`RequestHandler[]`) — same three dimensions as signup; counts successful reset requests because `postResetRequest` always returns 200 (no enumeration).
- **`mfaChallengeLimiter` / `mfaSendLimiter`** — two MFA challenge budgets keyed on a SHA-256 hash of the challenge string (falls back to `addressBlockOf` when no challenge is present), sharing the `MFA_CHALLENGE_DELIVERED_TTL_MS` window.
- **`IDENTITY_RATE_LIMIT_PROPERTY`** — custom `requestPropertyName` so the identity limiter's counter doesn't get overwritten by the address/block limiters in the chain.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — imports `buildRateLimiter`, `identityOf`, `addressBlockOf`, `readBodyField`, `rateLimitInfoOf`, and the `KEYED_BY_*` constants. All limiter objects in this file are materialised through that module's factory.
- **`@infrastructure/http/middlewares/human-challenge`** — `loginChallengeGate` delegates to `humanChallengeGate` once the identity budget threshold is crossed.
- **`src/modules/account/services/two-factor.ts`** — imports `MFA_CHALLENGE_DELIVERED_TTL_MS` to set the shared MFA challenge window.
- **`src/types/rate-limit-budget.ts` (via `@types`)** — provides the `RateLimitBudget` interface every budget object in this file conforms to.
- **`src/modules/account/routes.ts` / `module.ts`** — consume the exported limiter arrays and middleware to mount them on account routes.
- **`src/modules/account/tests/unit/rate-limits.test.ts`** — unit tests for the budget shapes and limiter wiring.
- **`src/modules/account/tests/integration/identity-rate-limit.test.ts`** — integration tests exercising the identity-budget path end-to-end.
- **`tests/integration/auth-hardening.test.ts`** — cross-cutting integration tests that assert the rate-limit + challenge interplay.

## Notes

- **`credentialLimiters` vs. `signupLimiters`/`resetRequestLimiters`**: the former uses `skipSuccessfulRequests: true` (only failures count); the latter two count *every* request because a successful response *is* the abuse vector (Sybil signups, reset spam). Mixing the two patterns is a security bug.
- **Chained limiter overwriting**: because `credentialLimiters` chains three limiters, the identity limiter uses a custom `requestPropertyName` (`credentialIdentityRateLimit`) so its counter on `request` survives the chain. `loginChallengeGate` is the sole reader of that property.
- **Fail-open by design in `loginChallengeGate`**: if `rateLimitInfoOf` returns `undefined` (store error, limiter skipped), the gate passes the request through. The budget limiter itself is the enforcement mechanism; the gate only *adds* a challenge and must never be the sole reason a login fails.
- **MFA challenge key fallback**: a request with no `challenge` field (forged/malformed body) keys on the caller's address block rather than a shared sentinel, preventing two such callers from exhaustively sharing one bucket.
- All budgets use `windowMs: 'shared'`, meaning the window is determined globally (likely via the rate-limit middleware's shared-window config), not per-budget.
