---
source: src/modules/feedback/tests/unit/rate-limits.test.ts
sha256: 2479a7e5e6c3cf134fe7edea269bdc564a3c45a887a4bdb4a42c482f9a7c713a
generated_at: 2026-09-23T18:42:46.039831+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/unit/rate-limits.test.ts

## Purpose

Unit tests that pin the _numerical relationships_ between the contact-form rate-limit budgets declared in the feedback module. They assert that per-identity and per-address budgets stay well below the global browsing budget, and that the address-block budget exceeds the per-address budget it widens. The file explicitly does **not** exercise the middleware at runtime; that concern is delegated to the integration tests.

## Key elements

- **`budget(namespace)`** (local const) — thin wrapper around `budgetIn(feedbackRateLimits, namespace)` that retrieves a single declared budget object by its namespace string.
- **`describe('contactLimiters')`** — the sole test suite.
    - _keeps every dimension a small fraction of the browsing budget_ — asserts `submissions.defaultMax` and `submission-identity.defaultMax` are each **< `DEFAULT_RATE_LIMIT_MAX / 5`**.
    - _sizes the address-block budget above its own address budget_ — asserts `submission-block.defaultMax` **>** `submissions.defaultMax`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — source of `DEFAULT_RATE_LIMIT_MAX`, the global browsing budget used as the comparison ceiling.
- **`src/modules/feedback/rate-limits.ts`** — source of `feedbackRateLimits`, the budget declarations under test.
- **`tests/support/rate-limit-budgets.ts`** — provides the `budgetIn` lookup helper used by the local `budget` function.

## Notes

- The file's docblock calls out that importing the `express-rate-limit` middleware directly is flagged by `no-restricted-imports` as an _integration_ concern. Behavioral tests (real requests through the middleware) live in `../integration/contact-identity-rate-limit.test.ts` and `../integration/submission-rate-limit.test.ts`. This unit file is intentionally limited to static numeric assertions on the declared budgets.
- The `submissions` namespace is used as the proxy for the "address" budget in the block-vs-address comparison; there is no separate `submission-address` key tested here.
