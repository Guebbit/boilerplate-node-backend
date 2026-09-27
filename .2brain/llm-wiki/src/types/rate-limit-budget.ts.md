---
source: src/types/rate-limit-budget.ts
sha256: e7fe1cf29c4010e339fbeb28ed3e64ab7b1f8f8dee6a054bbdd43756b0ec4da1
generated_at: 2026-09-27T15:47:20.591922+00:00
model: ollama:qwen3.8:27b
---

# src/types/rate-limit-budget.ts

## Purpose

Declares the `RateLimitBudget` interface — the data shape for a single rate-limit budget as it appears on a module's manifest (`AppModule.rateLimits`). It is a pure type (erased at compile time) that bridges the kernel's manifest declaration and the infrastructure's `buildRateLimiter` factory, without forcing infrastructure to import kernel.

## Key elements

- **`RateLimitBudget`** (interface, sole export) — one budget's full declarative configuration:
  - `name`, `namespace`, `keyedBy`, `bounds` — metadata consumed by the generated `docs/tools/security.md` table.
  - `environmentVariable` / `defaultMax` — the override knob and its fallback.
  - `windowMs` — `number` for a fixed window (e.g. MFA challenge lifetime) or the literal `'shared'` to read `NODE_RATE_LIMIT_WINDOW_MS`.
  - `keyGenerator` — optional; buckets by something other than the caller's IP.
  - `skipSuccessfulRequests` — only failed requests spend the budget (credential-limiting pattern).
  - `skip` — predicate to exclude a request entirely (currently only the global brake uses it for `GET /readyz`).
  - `requestWasSuccessful` — custom "did this succeed?" check (payments decline budget needs it to distinguish a real decline from another 409).
  - `requestPropertyName` — where `express-rate-limit` stores its counter on `req` for a downstream gate to read back.
  - `testExemption` — human-readable reason the env var is intentionally **not** raised in `tests/support/setup.ts`; its absence means `rate-limit-budgets.test.ts` requires it raised.

## Relationships

- **`src/kernel/registry.ts`** — `AppModule.rateLimits` is typed as `RateLimitBudget[]`; this file is the shape those arrays hold.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — `buildRateLimiter` accepts a `RateLimitBudget` and materialises the Express middleware. This is the primary consumer.
- **`src/modules/{account,feedback,orders,payments}/rate-limits.ts`** — each module exports budget objects conforming to this interface for its own endpoints.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — reads `name`, `keyedBy`, `bounds`, `audited`, etc. to render the security doc table.
- **`src/types/index.ts`** — re-exports the interface for external consumers.
- **`tests/cross-cutting/rate-limit-budgets.test.ts`** — validates every budget's shape and enforces the `testExemption` contract.
- **`tests/support/rate-limit-budgets.ts`** — test helper that references budgets when setting up env vars.

## Notes

- **Placement rationale:** the type lives in `src/types/` (not beside `AppModule` in kernel) because the dependency rule is infrastructure → types, never infrastructure → kernel. This file carries zero runtime code, so the "type-only import" wall holds.
- **`windowMs: 'shared'` vs a literal number** is the only enum-like discriminant; anything other than `'shared'` is treated as a fixed millisecond value at runtime.
- **`skipSuccessfulRequests` ≠ `skip`:** the former still *counts* the request (it's visible in the counter) but doesn't decrement the budget; the latter removes the request from the limiter entirely. Only the global brake uses `skip`.
- **`testExemption` is a documentation-as-code field:** it is the single source of truth for why a budget's env var is absent from the test setup. The cross-cutting test prints it on failure.
