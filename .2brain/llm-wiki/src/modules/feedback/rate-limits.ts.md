---
source: src/modules/feedback/rate-limits.ts
sha256: e35ae791e03a41a3a760012cb4a5ad43df8b5c118aba7f02628969b649389590
generated_at: 2026-09-23T18:40:38.919806+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/rate-limits.ts

## Purpose
Defines the rate-limit budgets that govern the feedback contact form (`POST /feedback/contact`). It declares three `RateLimitBudget` configurations—keyed by client address, submitted email, and address block—and converts them into Express middleware via `buildRateLimiter`. This isolates the feedback module's limits so they are tunable, auditable, and independently testable from the middleware infrastructure.

## Key elements
- **`SUBMISSION_ADDRESS_BUDGET`** (private) — 5 req/window per client IP; `keyedBy: KEYED_BY_ADDRESS`; namespace `submissions`.
- **`SUBMISSION_IDENTITY_BUDGET`** (private) — 5 req/window per submitted sender email; `keyedBy: KEYED_BY_SUBMITTED_EMAIL`; uses `identityOf` as key generator; namespace `submission-identity`.
- **`SUBMISSION_BLOCK_BUDGET`** (private) — 20 req/window per caller address block; `keyedBy: KEYED_BY_ADDRESS_BLOCK`; uses `addressBlockOf` as key generator; namespace `submission-block`.
- **`submissionLimiter`** (export) — `RequestHandler` for the address-keyed budget only.
- **`contactLimiters`** (export) — `RequestHandler[]` containing all three limiters stacked (address → identity → block) for the contact endpoint.
- **`feedbackRateLimits`** (export) — `readonly RateLimitBudget[]` listing all three budget objects, consumed by `./module.ts`'s `rateLimits` declaration.

## Relationships
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Provides `buildRateLimiter`, `identityOf`, `addressBlockOf`, and the `KEYED_BY_*` constants that this file imports to turn budget data into middleware.
- **`src/modules/feedback/module.ts`** — Declares `feedbackRateLimits` in its `rateLimits` list; this file is the source of those budget objects.
- **`src/modules/feedback/routes.ts`** — Applies `submissionLimiter` / `contactLimiters` to the contact-form route.
- **`src/types/index.ts`** & **`src/types/rate-limit-budget.ts`** — Define the `RateLimitBudget` interface that all three budget constants conform to.
- **Test files** (`rate-limits.test.ts`, `contact-identity-rate-limit.test.ts`, `submission-rate-limit.test.ts`) — Unit and integration tests that exercise the budgets and their key generators.

## Notes
- All three budgets use `windowMs: 'shared'`, meaning they draw from a single shared time window rather than each getting its own.
- Limits are **spent by successful requests** (`201`), not by failures. The file's comment explicitly notes that `skipSuccessfulRequests` would be meaningless here because the abuse pattern is repeated well-formed submissions.
- `defaultMax` is overridden at runtime by environment variables (`NODE_SUBMISSION_RATE_LIMIT_MAX`, `_EMAIL_MAX`, `_BLOCK_MAX`); the numeric literals are fallbacks only.
- The identity dimension reads the sender email from the form body using the same `identityOf` helper the credential and signup modules use, keeping key extraction consistent across the codebase.
