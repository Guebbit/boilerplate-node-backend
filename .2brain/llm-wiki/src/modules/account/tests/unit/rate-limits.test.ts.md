---
source: src/modules/account/tests/unit/rate-limits.test.ts
sha256: 57fbaeb5b1505da8e54dbc7d18cc715f050124e25c95e0bf8cd1dcd34fae3c43
generated_at: 2026-11-08T04:48:44.869484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/rate-limits.test.ts

## Purpose

Unit tests that pin the **relationships** between the account module's rate-limit budgets (identity, address, block, MFA) rather than any individual value. They verify ordering invariants (identity ≤ address ≤ block), that per-identity budgets stay a small fraction of the global browsing cap, and that MFA windows align with the challenge TTL. The file exists so that any change to a single budget number is immediately checked against its neighbors.

## Key elements

- **`budget(namespace)`** — local helper wrapping `budgetIn(accountRateLimits, namespace)`; returns a single budget entry by its namespace key for assertion.
- **`describe('credentialLimiters')`** — asserts the identity budget is < `DEFAULT_RATE_LIMIT_MAX / 5` and the triple ordering identity < address < block.
- **`describe('signupLimiters and resetRequestLimiters')`** — same two invariants applied to the `signup-*` and `reset-*` namespaces.
- **`describe('mfaChallengeLimiter and mfaSendLimiter')`** — asserts challenge budget > send budget (guesses are cheaper than deliveries) and both share the same window, which is **not** the shared browsing window.
- **`describe('the signed-in code-delivery budget')`** — asserts `mfa-account-send` is keyed on the authenticated account, windowed at 1 h (3 600 000 ms), and ≥ the per-challenge send budget.
- **`describe('the MFA budgets')`** — `it.each` over `mfa-challenge` / `mfa-send` asserting their `windowMs` equals `MFA_CHALLENGE_DELIVERED_TTL_MS`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — provides `DEFAULT_RATE_LIMIT_MAX`, the global browsing cap used as the upper bound in the "small fraction" assertions.
- **`src/modules/account/rate-limits.ts`** — provides `accountRateLimits`, the object whose budget entries are the subject of every assertion.
- **`src/modules/account/services/two-factor-challenge.ts`** — provides `MFA_CHALLENGE_DELIVERED_TTL_MS`, the code-defined TTL that MFA budget windows must match.
- **`tests/support/rate-limit-budgets.ts`** — provides the `budgetIn` lookup helper that resolves a namespace string to its budget descriptor.

## Notes

- The header comment explicitly defers the **behavioural** test (a real request through `express-rate-limit`) to `../integration/identity-rate-limit.test.ts`, because `no-restricted-imports` treats that middleware as an integration concern. This file never touches a running server.
- Tests are intentionally value-agnostic: they assert inequalities and equalities *between* budgets, so a developer can freely rescale a single number as long as the relative invariants hold.
- `mfa-account-send` is the one budget whose `keyedBy` is asserted to be a specific string (`'the authenticated account'`) and whose window is a literal `3_600_000` — unique in this file as both a keyed-on-identity and a non-TTL-aligned window.
