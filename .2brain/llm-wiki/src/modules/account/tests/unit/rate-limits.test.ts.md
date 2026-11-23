---
source: src/modules/account/tests/unit/rate-limits.test.ts
source_sha256: 27f8a158cad1c15a685188d675da520c172c1862a45cdd9b0070561869e66dc3
context_sha256: 67894b010f204d9ddfd7a85a06d9b5d3669e70e84eeac7055271ba435d346903
generated_at: 2026-11-22T04:07:41.994198+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/rate-limits.test.ts

## Purpose
Unit tests that pin the *relationships* between the numbers in `accountRateLimits` (credential, signup, reset, MFA budgets) rather than any single value. They guard properties such as a block budget not falling below its own address budget, and a budget not growing to the size of the global browsing limit. Behavioural checks, which send real requests through `express-rate-limit`, live in `src/modules/account/tests/integration/identity-rate-limit.test.ts`. Those checks count as integration concerns under the `no-restricted-imports` rule.

## Key elements
- `budget(namespace)` — local helper that looks up one of the module's declared budgets via `budgetIn(accountRateLimits, namespace)`.
- `credentialLimiters` tests:
  - The identity budget is below `DEFAULT_RATE_LIMIT_MAX / 5`.
  - The ordering is identity < address < block, by `defaultMax`.
- `signupLimiters and resetRequestLimiters` tests:
  - The signup and reset identity budgets are below `DEFAULT_RATE_LIMIT_MAX / 5`.
  - Each block budget is above its address budget.
- `mfaChallengeLimiter and mfaSendLimiter` tests:
  - `mfa-challenge` has a higher `defaultMax` than `mfa-send`.
  - Both have the same `windowMs`, and it is not `'shared'`.
- Signed-in code-delivery budget (`mfa-account-send`) tests:
  - It is keyed on `'the authenticated account'`.
  - Its window is `3_600_000` ms.
  - Its `defaultMax` is at least that of `mfa-send`.
- `the MFA budgets` test (`it.each` over `mfa-challenge` and `mfa-send`): `windowMs` equals `MFA_CHALLENGE_DELIVERED_TTL_MS`.

## Relationships
- `src/modules/account/rate-limits.ts` — supplies `accountRateLimits`, the declarations under test.
- `src/infrastructure/http/middlewares/rate-limit.ts` — supplies `DEFAULT_RATE_LIMIT_MAX`, the global browsing budget that identity budgets are compared against.
- `src/modules/account/services/two-factor-challenge.ts` — supplies `MFA_CHALLENGE_DELIVERED_TTL_MS`, which the MFA windows must equal.
- `tests/support/rate-limit-budgets.ts` — supplies `budgetIn`, imported as `@tests/rate-limit-budgets`.

## Notes
- The tests only compare declared budget metadata (`defaultMax`, `windowMs`, `keyedBy`). They make no requests and exercise no middleware.
- The MFA window test exists because `module.yaml` holds the number but cannot import the TTL constant, which is code. A window shorter than the challenge would refill while the challenge is still live.
- The comments give the reason for the `mfa-account-send` budget sitting at or above `mfa-send`: a signed-in account has no challenge to spend.
