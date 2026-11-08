---
source: src/modules/tasks/rate-limits.ts
sha256: 2a15bb5c518486014bd03fe7219d22384cff99c1b1ba3e0e87e3997e47e1e1f6
generated_at: 2026-11-08T08:35:56.501923+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/rate-limits.ts

## Purpose
Defines the three rate-limit budgets for the tasks module — address, submitted-email identity, and caller address-block — and exposes them as Express middleware. Budget raw values live in `./rate-limits.generated`; this file shapes them into `RateLimitBudget` objects and hands each to `buildRateLimiter`.

## Key elements
- **`submissionLimiter: RequestHandler`** — Address-keyed middleware for `POST /tasks`. A single well-formed submission from one IP is the unit of abuse; successful requests are *not* skipped.
- **`contactLimiters: RequestHandler[]`** — Three stacked middlewares for the contact form: address (`submissionLimiter`), submitted-email identity, and caller address-block. Applied in sequence so any dimension tripping its budget rejects the request.
- **`tasksRateLimits: readonly RateLimitBudget[]`** — The three budget objects in declaration order. Consumed by `module.ts`'s `rateLimits` registry.
- **`SUBMISSION_ADDRESS_BUDGET` / `SUBMISSION_IDENTITY_BUDGET` / `SUBMISSION_BLOCK_BUDGET`** — Internal budget literals built by spreading the generated numbers and attaching the correct `keyedBy` / `keyGenerator`.

## Relationships
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Source of `buildRateLimiter`, `identityOf`, `addressBlockOf`, and the `KEYED_BY_*` constants this file composes.
- **`src/modules/tasks/module.ts`** — Registers `tasksRateLimits` on its `rateLimits` field so the module's public contract includes these budgets.
- **`src/modules/tasks/routes.ts`** — Applies `submissionLimiter` / `contactLimiters` to the corresponding route handlers.
- **`src/types/index.ts` / `src/types/rate-limit-budget.ts`** — Provide the `RateLimitBudget` type imported here.
- **`src/modules/tasks/tests/unit/rate-limits.test.ts`** — Unit-tests the budget shapes and exports.
- **`src/modules/tasks/tests/integration/submission-rate-limit.test.ts`** — Integration-tests the address-keyed limiter end-to-end.
- **`src/modules/tasks/tests/integration/contact-identity-rate-limit.test.ts`** — Integration-tests the identity (submitted-email) dimension.

## Notes
- `skipSuccessfulRequests` is deliberately **not** set: every abusive contact-form post returns `201`, so skipping successes would not reduce the abuse surface.
- Numeric limits are never hard-coded here; they come from `tasksRateLimitData` in `./rate-limits.generated` (a build artifact not tracked in the dependency graph).
- `contactLimiters` is an *array* meant to be spread into `app.use(...)` or `router.post(..., ...contactLimiters)`; the three middlewares are independent dimensions, not cumulative.
