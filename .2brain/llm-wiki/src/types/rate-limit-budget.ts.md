---
source: src/types/rate-limit-budget.ts
sha256: eb2e71644a9097b58511ef0caf72f96c0cf5590e66ea1e3a7941e65b0231f10e
generated_at: 2026-11-14T22:56:32.836860+00:00
model: ollama:qwen3.8:27b
---

# src/types/rate-limit-budget.ts

## Purpose

Defines the `RateLimitBudget` interface — the declarative data shape for a single rate-limit budget. It is deliberately placed under `src/types/` (not beside `AppModule` in kernel) so that infrastructure code, which is forbidden from importing kernel, can still consume the shape when building the actual Express middleware.

## Key elements

- **`RateLimitBudget`** (interface, the sole export) — one budget's full configuration:
  - **Identity & limits:** `name`, `namespace`, `environmentVariable`, `defaultMax`, `windowMs` (number or `'shared'`), `keyedBy`, `bounds`, `audited`.
  - **Bucketing:** `keyGenerator` (optional custom key function), `skipSuccessfulRequests` (only failures spend the budget), `skip` (budget never applies to matching requests).
  - **Outcome detection:** `requestWasSuccessful` (custom success check beyond HTTP status).
  - **Downstream read-back:** `requestPropertyName` (where `express-rate-limit` writes its counter on `request` for later gates).
  - **Degradation:** `onStoreError` (`'memory'` default — fail-secure per worker; `'pass'` — let through unbudgeted).
  - **Escalation:** `escalation.doublings` — smart lockout where each repeated lockout doubles the window up to N doublings.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — `buildRateLimiter` is the single factory that turns a `RateLimitBudget` into an Express middleware; every budget in the app goes through it.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — the `namespace` field is the Redis/memory key prefix this store uses for each budget's counter.
- **`src/kernel/registry.ts`** — the module manifest type in this file declares `rateLimits` as an array of `RateLimitBudget`; each module file supplies its instances there.
- **`src/modules/account/rate-limits.ts`**, **`src/modules/cart/rate-limits.ts`**, **`src/modules/example/rate-limits.ts`**, **`src/modules/invoicing/rate-limits.ts`**, **`src/modules/orders/rate-limits.ts`**, **`src/modules/payments/rate-limits.ts`**, **`src/modules/returns/rate-limits.ts`**, **`src/modules/tasks/rate-limits.ts`**, **`src/modules/account/mail-budget.ts`** — each exports concrete `RateLimitBudget` instances for its module.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — reads the budget declarations (uses `name`, `keyedBy`, `bounds`) to produce a generated documentation table.
- **`src/types/index.ts`** — barrel re-export so consumers can import `RateLimitBudget` from the package-level types entry.

## Notes

- **`windowMs: 'shared'`** is a sentinel string, not a number. At runtime it resolves to `NODE_RATE_LIMIT_WINDOW_MS`; a literal number opts a budget out of the shared window (e.g. MFA challenge budgets sized to the challenge lifetime).
- **`skipSuccessfulRequests` vs `skip`:** `skipSuccessfulRequests` still registers the request in the counter but only decrements on failure; `skip` means the budget is entirely inapplicable (used only by the global brake to exempt `GET /livez` / `GET /readyz`).
- **`onStoreError` defaults to `'memory'`** (fail-secure). A new budget is locked out per-worker if Redis is down unless it explicitly opts into `'pass'` — only the browsing brake does so.
- **`escalation`** implements Entra/Okta-style smart lockout: first lockout = `windowMs`, second = `2 × windowMs`, etc., capped at `doublings` doublings. Currently used only by the per-account credential budget.
