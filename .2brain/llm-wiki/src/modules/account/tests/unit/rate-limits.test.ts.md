---
source: src/modules/account/tests/unit/rate-limits.test.ts
sha256: 57fbaeb5b1505da8e54dbc7d18cc715f050124e25c95e0bf8cd1dcd34fae3c43
generated_at: 2026-10-29T03:05:11.390852+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/rate-limits.test.ts

## Purpose

Unit test that pins the **ordinal relationships** between the account module's rate-limit budgets (credential, signup, reset, MFA) rather than their absolute values. It enforces invariants like "identity budget < global browsing budget / 5" and "identity ≤ address ≤ block" so that the budgets remain meaningful relative to one another, even if individual numbers are later tuned.

## Key elements

- **`budget(namespace)`** — thin helper that calls `budgetIn(accountRateLimits, namespace)` to fetch a single declared budget by its string key.
- **`describe('credentialLimiters')`** — asserts identity < global/5, and the triple ordering identity < address < block.
- **`describe('signupLimiters and resetRequestLimiters')`** — same two invariants for signup and reset namespaces.
- **`describe('mfaChallengeLimiter and mfaSendLimiter')`** — challenge budget > send budget; both windowed on the challenge lifetime (not the shared browsing window).
- **`describe('the signed-in code-delivery budget')`** — `mfa-account-send` is keyed on the authenticated account, windowed to 3 600 000 ms (1 h), and ≥ the per-challenge send budget.
- **`describe('the MFA budgets')`** — parameterised check that `mfa-challenge` and `mfa-send` both use `MFA_CHALLENGE_DELIVERED_TTL_MS` as their window.

## Relationships

- **`src/modules/account/rate-limits.ts`** — the module under test; provides `accountRateLimits` whose budgets are the assertions' subjects.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — source of `DEFAULT_RATE_LIMIT_MAX`, the "global browsing budget" used as an upper-bound reference in every identity-budget assertion.
- **`tests/support/rate-limit-budgets.ts`** — provides `budgetIn`, the shared helper that resolves a namespace key to its `{ defaultMax, windowMs, keyedBy }` tuple.
- **`src/modules/account/services/two-factor-challenge.ts`** — source of `MFA_CHALLENGE_DELIVERED_TTL_MS`, the canonical challenge-lifetime constant the MFA windows must match.

## Notes

- The file header explicitly scopes itself to **structural/ordinal** assertions. Behavioural tests (actually sending requests through `express-rate-limit`) are deferred to `../integration/identity-rate-limit.test.ts` because `no-restricted-imports` treats that middleware as an integration concern.
- All assertions use relational operators (`toBeLessThan`, `toBeGreaterThan`) so the suite passes regardless of the exact numeric values, as long as the relative ordering holds.
- The `windowMs` checks for MFA budgets compare against a **code constant** (`MFA_CHALLENGE_DELIVERED_TTL_MS`), not a literal, to avoid duplicating the TTL in YAML or config.
