---
source: src/types/rate-limit-budget.ts
sha256: 0d1f7fdc1959cd3addb0a054cf59e4016174e28ce38d8385f73f2c93b71fd0ad
generated_at: 2026-09-23T19:50:28.070375+00:00
model: ollama:qwen3.8:27b
---

# src/types/rate-limit-budget.ts

## Purpose

Defines the `RateLimitBudget` interface — the declarative data shape every module uses to specify a rate-limit budget. It sits in `src/types/` (not beside `AppModule` in the kernel) so that the infrastructure layer (`buildRateLimiter`) can import it without creating a forbidden upward dependency into the kernel. The type is erased at compile time; at runtime it is read by the middleware factory to produce the actual Express limiter.

## Key elements

- **`RateLimitBudget`** (interface, sole export) — one budget's full declaration:
  - `name`, `keyedBy`, `bounds` — human-readable metadata for the generated `docs/tools/security.md` table.
  - `namespace` — Redis/memory key prefix for the counter store.
  - `environmentVariable` / `defaultMax` — the env-var override and its fallback limit.
  - `windowMs: number | 'shared'` — `'shared'` means "read `NODE_RATE_LIMIT_WINDOW_MS`"; a literal number is used for non-standard windows (e.g. MFA challenge budgets sized to the challenge lifetime).
  - `keyGenerator?` — custom bucketing key; absent means the caller's IP address.
  - `skipSuccessfulRequests?` — only a failed request spends the budget (credential limiters).
  - `requestWasSuccessful?` — custom success predicate instead of the response status (payments decline budget).
  - `requestPropertyName?` — where `express-rate-limit` stores the counter on `request` so a downstream gate can read it.
  - `audited` — whether a 429 refusal emits an audit event.
  - `testExemption?` — reason the env var is deliberately *not* raised in test setup; absent means the cross-cutting test requires it raised.

## Relationships

- **`src/kernel/registry.ts`** — `AppModule.rateLimits` is typed as `RateLimitBudget[]`; modules declare their budgets using this interface.
- **`src/modules/{account,feedback,orders,payments}/rate-limits.ts`** — each exports an array of `RateLimitBudget` objects that are registered on their module's manifest.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — `buildRateLimiter` reads a `RateLimitBudget` and constructs the corresponding Express middleware; this is the only consumer that acts on the shape at runtime.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — reads the budget arrays to generate the security docs table.
- **`src/types/index.ts`** — re-exports `RateLimitBudget` so importers can use `@types`.
- **`tests/cross-cutting/rate-limit-budgets.test.ts`** — validates every budget; enforces that `testExemption` is the sole mechanism for waiving the "env var must be raised" rule.
- **`tests/support/rate-limit-budgets.ts`** — test helper that raises each budget's `environmentVariable` (skipping those with a `testExemption`).

## Notes

- **Dependency direction is deliberate.** The file lives in `types/` because infrastructure may import *down* into types but not up into kernel. Moving it next to `AppModule` would break that wall.
- **`windowMs: 'shared'` is a string sentinel, not a number.** Consumers must branch on it before doing arithmetic; it does not mean "infinite" or "default" in a numeric sense.
- **`testExemption` inverts the default.** A *missing* field is the stricter case (test requires the env var raised); a *present* field is the escape hatch. The test prints the string on failure to explain why the exemption exists.
- **`skipSuccessfulRequests` and `requestWasSuccessful` are mutually exclusive in intent.** The first changes *when* the budget is consumed; the second changes *what counts as success* for that determination. The payments module's decline budget uses the latter to distinguish a genuine 409 decline from the confirm route's other 409.
