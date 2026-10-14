---
source: src/modules/account/tests/unit/rate-limits.test.ts
sha256: e4e0dafc9d268596d72d50af77eb3bb6a3f49c176a8b64f03250bdc21795a5c2
generated_at: 2026-10-14T09:22:09.556110+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/rate-limits.test.ts

## Purpose

Unit tests that pin **relational invariants** between the account module's rate-limit budgets (credential, signup, reset, MFA challenge, MFA send, and signed-in code delivery). The tests assert orderings and fractional ceilings between budgets rather than locking any single numeric value, so individual budgets can be tuned freely as long as the relative structure holds.

## Key elements

- **`budget(namespace)`** — module-level helper that wraps `budgetIn(accountRateLimits, namespace)` to pull a budget config by its `namespace` string.
- **`credentialLimiters`** (describe) — asserts `credentials-identity < DEFAULT_RATE_LIMIT_MAX / 5` and the ordering `identity < address < block`.
- **`signupLimiters and resetRequestLimiters`** (describe) — same two invariants (identity ≪ global; block > address) applied to the `signup-*` and `reset-*` namespaces.
- **`mfaChallengeLimiter and mfaSendLimiter`** (describe) — asserts challenge budget > send budget, both share the same `windowMs`, and that window is a concrete value (not the string `'shared'`).
- **`the signed-in code-delivery budget`** (describe) — asserts `mfa-account-send` is keyed by the authenticated account, windowed at 3 600 000 ms (1 h), and its `defaultMax ≥ mfa-send.defaultMax`.

## Relationships

- **`src/modules/account/rate-limits.ts`** — the subject under test; provides the `accountRateLimits` array of budget declarations that every assertion reads from.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — source of `DEFAULT_RATE_LIMIT_MAX`, used as the global ceiling against which per-module budgets are compared.
- **`tests/support/rate-limit-budgets.ts`** — provides the `budgetIn` lookup helper used by the local `budget()` wrapper.

## Notes

- The file's header comment explicitly defers the **behavioural** property (requests actually being counted, keyed on identity/address/block, MFA challenge-less fallback) to `../integration/identity-rate-limit.test.ts`, because `no-restricted-imports` classifies `express-rate-limit` middleware as an integration concern. This file is purely structural/invariant.
- All assertions are relational (`toBeLessThan`, `toBeGreaterThan`, `toBeGreaterThanOrEqual`). No test pins an absolute number, so bumping a single budget does not break the suite unless it violates an ordering or the `/5` ceiling.
- The `'shared'` string check on `windowMs` guards against accidentally inheriting the global browsing window instead of the challenge-specific one.
