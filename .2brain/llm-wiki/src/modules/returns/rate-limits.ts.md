---
source: src/modules/returns/rate-limits.ts
sha256: 562fa6a2a7d234fe6d76d4f3ebff218807c55012a720f687e48e70f1a3be0909
generated_at: 2026-10-15T11:54:32.492423+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/rate-limits.ts

## Purpose

Declares the Returns module's rate-limit budget for `POST /returns` and exposes the resulting Express middleware. It exists so the module can register its budget alongside other modules through the shared `buildRateLimiter` factory, keeping per-endpoint throttling declarative and auditable.

## Key elements

- **`RETURNS_WRITE_BUDGET`** (internal) — A `RateLimitBudget` constant. Namespace `returns-write`, env var `NODE_RETURNS_RATE_LIMIT_MAX`, default max 20, `windowMs: 'shared'`, keyed by authenticated account via `accountIdOf`, `audited: true`.
- **`returnsWriteLimiter`** (export) — The Express `RequestHandler` produced by `buildRateLimiter(RETURNS_WRITE_BUDGET)`. Applied as middleware on the `POST /returns` route.
- **`returnsRateLimits`** (export) — `readonly RateLimitBudget[]` (currently one entry) that `module.ts` lists under its `rateLimits` property for registry/discovery.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Provides `buildRateLimiter`, `accountIdOf`, and `KEYED_BY_AUTHENTICATED_ACCOUNT`. This file consumes all three to turn its budget definition into a working limiter.
- **`src/types/rate-limit-budget.ts`** (via `@types`) — Supplies the `RateLimitBudget` type that shapes `RETURNS_WRITE_BUDGET`.
- **`src/types/index.ts`** — Barrel re-export that resolves the `@types` import specifier.
- **`src/modules/returns/module.ts`** — Consumes `returnsRateLimits` to register this module's budgets in the global rate-limit registry.
- **`src/modules/returns/routes.ts`** — Applies `returnsWriteLimiter` as middleware on the `POST /returns` handler.

## Notes

- `windowMs: 'shared'` means this budget participates in a common time window shared across modules rather than defining its own.
- Keying is per **account**, not per IP or address. The `bounds` string documents the rationale: an address-keyed budget would let one signed-in account behind a shared address starve other callers.
- The `defaultMax` of 20 is a floor for local/dev; production overrides via `NODE_RETURNS_RATE_LIMIT_MAX`.
- The file is side-effect-free (`@module`); all exports are pure values.
