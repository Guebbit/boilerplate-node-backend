---
source: src/modules/tasks/tests/unit/rate-limits.test.ts
sha256: 8132efa53a427de355ea595e8a4c22d92bc81f0773fa9e6061ce86cb2537929e
generated_at: 2026-11-08T08:41:37.467126+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/unit/rate-limits.test.ts

## Purpose

Unit test that pins invariant **relationships** between the contact-form rate-limit budgets (submissions, submission-identity, submission-block) rather than their absolute values. It exists to prevent accidental re-tuning of those numbers from breaking the design intent that a one-time contact filing stays well below ordinary browsing and that the broader block budget encloses the narrower address budget.

## Key elements

- **`budget(namespace)`** — local helper that calls `budgetIn(tasksRateLimits, namespace)` to retrieve one declared budget by its string key.
- **`describe('contactLimiters')`** — two assertions:
  - `submissions.defaultMax` and `submission-identity.defaultMax` are each **< `DEFAULT_RATE_LIMIT_MAX / 5`**.
  - `submission-block.defaultMax` is **> `submissions.defaultMax`**.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — source of `DEFAULT_RATE_LIMIT_MAX`, the global browsing cap used as the reference ceiling.
- **`@modules/tasks/rate-limits`** — the module under test; its `tasksRateLimits` array is the data being asserted against.
- **`@tests/rate-limit-budgets`** — provides the `budgetIn` lookup helper shared across rate-limit test suites.

## Notes

- The file's header docblock explicitly states that **behavioural** (real-request-through-middleware) tests live in the integration suite (`../integration/contact-identity-rate-limit.test.ts`, `../integration/submission-rate-limit.test.ts`). This unit file only checks numeric invariants and does not touch `express-rate-limit` at runtime.
- Assertions are relational (ratios, ordering), not pinned to exact integers, so budget values can be tuned as long as the invariants hold.
- The `budget` helper narrows `budgetIn` to `tasksRateLimits` specifically, avoiding cross-module namespace collisions.
