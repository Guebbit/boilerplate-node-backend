---
source: src/types/rate-limit-budget.ts
sha256: 94d5b708883a5043a2f71b535d470723d81344e45e2928a3af4eb89b6b474b7f
generated_at: 2026-11-08T09:16:41.944381+00:00
model: ollama:qwen3.8:27b
---

# src/types/rate-limit-budget.ts

## Purpose

Declares the `RateLimitBudget` interface — the single data shape every rate-limit budget in the app must conform to. It sits under `src/types/` (rather than beside `AppModule` in the kernel) so that infrastructure can import it *downward* without violating the kernel→infrastructure dependency wall. Infrastructure's `buildRateLimiter` reads one of these objects and emits the actual Express middleware.

## Key elements

- **`RateLimitBudget`** (interface, sole export) — one budget's full declarative data. Notable fields:
  - `name`, `keyedBy`, `bounds` — human-readable strings consumed by the generated security docs table.
  - `namespace` — the Redis/memory key prefix handed to `rate-limit-store.ts`.
  - `environmentVariable` / `defaultMax` — runtime cap resolution.
  - `windowMs` — `number` for a fixed window, or `'shared'` to read `NODE_RATE_LIMIT_WINDOW_MS`.
  - `keyGenerator?` — custom bucketing (defaults to the caller's single address).
  - `skipSuccessfulRequests?` — only failures spend the budget (used by credential limiters).
  - `skip?` — request-level exemption; only the global health-probe brake uses it.
  - `requestWasSuccessful?` — custom success predicate (payments decline budget).
  - `requestPropertyName?` — where `express-rate-limit` parks its counter on `req` for downstream gates.
  - `onStoreError?` — `'memory'` (default) or `'pass'` when the limits store is down.
  - `escalation?` — exponential lockout doublings (per-account credential budget).

## Relationships

- **`src/kernel/registry.ts`** — `AppModule.rateLimits` is an array of `RateLimitBudget`; modules declare their budgets here.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — `buildRateLimiter` is the single factory that turns a `RateLimitBudget` into an Express middleware.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — resolves `namespace` into the actual Redis/memory key; handles `onStoreError` fallback logic.
- **`src/infrastructure/http/config.ts`** — provides the store implementation and global config that the limiter factory reads.
- **`src/types/index.ts`** — barrel re-export so consumers can `import { RateLimitBudget } from '@types'`.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — reads every declared budget's `name`, `keyedBy`, `bounds` to render the table in `docs/tools/security.md`.
- **Module `rate-limits.ts` files** (`account`, `cart`, `example`, `invoicing`, `orders`, `payments`, `returns`, `tasks`) — each declares one or more `RateLimitBudget` objects on its module manifest.
- **`src/modules/account/mail-budget.ts`** — declares an additional account-scoped budget using this shape.

## Notes

- This file is **type-only** at runtime (erased at compile time); it carries no logic.
- `windowMs: 'shared'` is a sentinel string, not a number — code reading it must branch on it.
- `skip` and `skipSuccessfulRequests` are easy to confuse: `skip` means the budget doesn't apply at all; `skipSuccessfulRequests` means the request is counted but a 2xx doesn't spend it.
- `onStoreError` defaults to `'memory'` (fail-secure). The only budget opted out to `'pass'` is the global browsing brake, which guards nothing critical.
- The `escalation` field is implemented by `escalatingStore` in the rate-limit-store; it's not a built-in `express-rate-limit` option.
