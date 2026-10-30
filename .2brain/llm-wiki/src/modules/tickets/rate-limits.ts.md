---
source: src/modules/tickets/rate-limits.ts
sha256: 0882b6710a85d818d4adefa7c7b77337d235c8199ee1b46e85d7936f755fdb12
generated_at: 2026-10-29T06:04:38.131599+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/rate-limits.ts

## Purpose

Defines the tickets module's rate-limit budgets (as `RateLimitBudget` data) and turns them into Express middleware via `buildRateLimiter`. The budgets govern the contact-form submission endpoint (`POST /tickets`) across three dimensions: caller address, submitted email identity, and caller address block.

## Key elements

- **`SUBMISSION_ADDRESS_BUDGET`** (internal) — Spreads `ticketsRateLimitData.submissions` and sets `keyedBy: KEYED_BY_ADDRESS`. Bounds well-formed submissions per address per window.
- **`submissionLimiter`** (exported `RequestHandler`) — The address-keyed limiter, built from `SUBMISSION_ADDRESS_BUDGET`.
- **`SUBMISSION_IDENTITY_BUDGET`** (internal) — Spreads `ticketsRateLimitData.submissionIdentity`, keys on `KEYED_BY_SUBMITTED_EMAIL`, uses `identityOf` as key generator.
- **`SUBMISSION_BLOCK_BUDGET`** (internal) — Spreads `ticketsRateLimitData.submissionBlock`, keys on `KEYED_BY_ADDRESS_BLOCK`, uses `addressBlockOf` as key generator.
- **`contactLimiters`** (exported `RequestHandler[]`) — Array of three middleware handlers: address, identity, and address-block limiters applied in sequence.
- **`ticketsRateLimits`** (exported `readonly RateLimitBudget[]`) — The three raw budget objects, listed on `module.ts`'s `rateLimits` declaration for documentation/audit purposes.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — Source of `buildRateLimiter` (budget → middleware factory), the `KEYED_BY_*` key-dimension constants, and the `identityOf` / `addressBlockOf` key generators. Every budget in this file is passed through that factory.
- **`./rate-limits.generated`** — Provides `ticketsRateLimitData`, the numeric window/max values for each budget dimension. This file only assigns the `keyedBy` and `keyGenerator` fields on top of the spread data.
- **`@types` (`src/types/index.ts`, `src/types/rate-limit-budget.ts`)** — Supplies the `RateLimitBudget` type that each budget object conforms to.
- **`./module.ts`** — Declares `ticketsRateLimits` in its `rateLimits` list; this file is the concrete definition backing that declaration.
- **`./routes.ts`** — Applies `submissionLimiter` / `contactLimiters` to the relevant route handlers.
- **Tests** (`rate-limits.test.ts`, `submission-rate-limit.test.ts`, `contact-identity-rate-limit.test.ts`) — Unit and integration tests exercising the three budget dimensions.

## Notes

- `skipSuccessfulRequests` is intentionally **not** used here: every abusive contact-form post returns `201`, so skipping successes would have no effect on the abuse this limits.
- The identity dimension keys on the *submitted email address* (free-text field in the form), read by the same `identityOf` helper used by credential and signup budgets — the form carries no other structural identity.
- Budget numeric values live in the generated file; this file only wires dimensions and key generators. Changes to limits should go to `rate-limits.generated.ts`, not here.
