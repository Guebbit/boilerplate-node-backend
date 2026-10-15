---
source: src/types/rate-limit-budget.ts
sha256: 18b0c34c26f68bc099a5fc467613d6633957e936ca264e7ccb17629507a03121
generated_at: 2026-10-15T12:30:10.370197+00:00
model: ollama:qwen3.8:27b
---

# src/types/rate-limit-budget.ts

## Purpose

Defines the `RateLimitBudget` interface — the declarative data shape for a single rate-limit budget. Module manifests (`AppModule.rateLimits`) declare budgets in this shape; `buildRateLimiter` in infrastructure consumes it to produce the actual Express middleware. It lives in `src/types/` (not `src/kernel/`) because infrastructure may only import downward into `types`, never upward into `kernel`.

## Key elements

- **`RateLimitBudget`** (interface, sole export) — one budget's full configuration:
  - `name`, `namespace`, `environmentVariable`, `defaultMax`, `windowMs` — core limit parameters. `windowMs` accepts `number | 'shared'`; `'shared'` reads `NODE_RATE_LIMIT_WINDOW_MS`.
  - `keyedBy`, `bounds`, `audited` — one-line descriptive metadata consumed by the generated security docs table.
  - `keyGenerator?` — optional custom bucketing function (default: caller's single address).
  - `skipSuccessfulRequests?` — only failed requests spend the budget (credential-gate use case).
  - `skip?` — requests the budget never applies to at all (e.g. liveness/readiness probes on the global brake).
  - `requestWasSuccessful?` — custom success predicate (payments decline budget distinguishes a genuine 409 from a confirm-route 409).
  - `requestPropertyName?` — where `express-rate-limit` stores its counter on `request` so downstream gates can read it back.
  - `onStoreError?` — `'memory'` (default, fail-secure) or `'pass'` (fail-open; only the browsing brake uses this).
  - `escalation?` — `{ doublings: number }` for exponential lockout backoff (first lockout = `windowMs`, next = `2×windowMs`, …).
  - `testExemption?` — string reason why this budget's env var is *not* raised in test setup; absence means `rate-limit-budgets.test.ts` requires it raised.

## Relationships

- **`src/kernel/registry.ts`** — `AppModule.rateLimits` is typed as `RateLimitBudget[]`; this is where module authors declare their budgets.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — `buildRateLimiter` reads a `RateLimitBudget` and constructs the Express rate-limit middleware.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — the `namespace` field maps to the Redis/memory key prefix this store manages.
- **`src/infrastructure/http/config.ts`** — supplies the shared window (`NODE_RATE_LIMIT_WINDOW_MS`) resolved when `windowMs` is `'shared'`.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — iterates all budgets and renders the `name` / `keyedBy` / `bounds` / `audited` columns into `docs/tools/security.md`.
- **Module `rate-limits.ts` files** (account, cart, example, feedback, invoicing, orders, payments, returns) — each exports an array of `RateLimitBudget` objects for its domain.
- **`src/modules/account/mail-budget.ts`** — a budget (or group) that extends/uses this type for mail-sending limits.
- **`src/types/index.ts`** — barrel re-export; consumers import `RateLimitBudget` from `@types` rather than this file directly.

## Notes

- **`skip` vs `skipSuccessfulRequests`** are orthogonal: `skip` means the request is invisible to the budget; `skipSuccessfulRequests` means successful requests are counted (for audit) but don't decrement the budget.
- **`onStoreError`** defaults to `'memory'` — a budget fails *secure* by default. Only a budget that "guards nothing worth a lock-out" opts into `'pass'`.
- **`testExemption`** is a string *reason*, not a boolean. Its presence exempts the budget from the env-var-raising assertion in `tests/cross-cutting/rate-limit-budgets.test.ts`; its absence means the test will fail if the variable isn't raised.
- **`windowMs: 'shared'`** is a string sentinel, not a number. Code that reads `windowMs` must branch on this before treating it as a millisecond value.
- The interface is type-only (`import type`); it carries no runtime code and is erased at compile time.
