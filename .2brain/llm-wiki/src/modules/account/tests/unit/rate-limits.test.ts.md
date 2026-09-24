---
source: src/modules/account/tests/unit/rate-limits.test.ts
sha256: c0f26f77a04ce8453942ee4559cd0f0c24f5953d3c8671f05e97e5d68521e375
generated_at: 2026-09-23T18:16:31.517742+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/rate-limits.test.ts

## Purpose

Unit tests that pin the **ordering relationships** among the account module's rate-limit budgets (credential, signup, reset, MFA) without asserting any single absolute value. They exist to catch configuration regressions where a sub-budget accidentally exceeds or collapses into the one it was layered beneath.

## Key elements

- **`budget(namespace)`** – thin helper that calls `budgetIn(accountRateLimits, namespace)` so each assertion reads as a named lookup rather than a deep property chain.
- **`describe('credentialLimiters')`** – asserts identity < address < block ordering, and that the identity budget stays below `DEFAULT_RATE_LIMIT_MAX / 5` (i.e., a small fraction of the global browsing window).
- **`describe('signupLimiters and resetRequestLimiters')`** – same two invariants (identity ≪ global; block > address) applied to the signup and reset budget triples.
- **`describe('mfaChallengeLimiter and mfaSendLimiter')`** – asserts the challenge (guess) budget is *larger* than the send (delivery) budget, and that both share an explicit window (not the `'shared'` alias) tied to challenge lifetime.

## Relationships

- **`src/modules/account/rate-limits.ts`** – the module under test; provides the `accountRateLimits` config object whose budgets these assertions inspect.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – supplies `DEFAULT_RATE_LIMIT_MAX`, the global browsing limit used as the upper-bound reference in the "small fraction" assertions.
- **`tests/support/rate-limit-budgets.ts`** – provides `budgetIn`, the shared helper that resolves a budget entry from a rate-limits config by `namespace`.
- The file header points to **`../integration/identity-rate-limit.test.ts`** for the behavioural (request-through-middleware) property tests that `no-restricted-imports` keeps out of this unit file.

## Notes

- The tests deliberately assert **relative ordering** (`≤`, `<`, `>`), not fixed numbers. Changing a single budget is safe as long as the ordering invariants hold; the suite will not fail on a legitimate value bump.
- `no-restricted-imports` forbids importing `express-rate-limit` middleware here, so the "sends a real request" behavioural check is intentionally split into the integration test. Adding such a check to this file would violate the lint rule.
- The `'shared'` sentinel for `windowMs` is the module's way of saying "use the global browsing window." The MFA tests explicitly assert it is **not** used, because MFA windows must track challenge lifetime independently.
