---
source: src/types/index.ts
sha256: bcc553aea4548a90c1f57e3bcb5a4771eccb7934b53755d00e86111d283d8b84
generated_at: 2026-09-23T19:50:14.202010+00:00
model: ollama:qwen3.8:27b
---

# src/types/index.ts

## Purpose

A type-only barrel that consolidates three type sources — generated API models, generated AsyncAPI types, and hand-written auth/rate-limit DTOs — behind a single import path (`@types`). Consumers never need to know which physical file a given type actually lives in.

## Key elements

- **`export * from '@api/models'`** — re-exports all generated OpenAPI/API model types.
- **`export * from './asyncapi.generated'`** — re-exports types generated from `asyncapi.yaml` (via `npm run gen:asyncapi`).
- **Auth-context types** (`AuthContext`, `AuthorizationScope`, `Caller`, `CallerContext`, `PlatformCaller`, `TenantCaller`, `TenantCallerContext`) — re-exported from `./auth-context`; a transport-safe, DIP-compliant user representation.
- **`RateLimitBudget`** — re-exported from `./rate-limit-budget`; the shared shape used by both the kernel registry manifest and the infrastructure rate-limiter factory.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — consumes `RateLimitBudget` (and likely API model types) from this barrel; the barrel exists partly so this module can reference the budget shape without importing kernel.
- **`src/infrastructure/http/request.ts`** — consumes auth-context and/or API model types for request typing.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — operates on the `RateLimitBudget` shape defined via this module.
- **Infrastructure adapters** (`queue.ts`, `mailer.ts`, `email.worker.ts`, `image.worker.ts`, `demo-outbox.ts`, antibot providers) — import generated API models or AsyncAPI types through this barrel.
- **`src/app/workers.ts`**, **`scenarios/products.ts`**, **`scripts/db/*.ts`** — import API model types via the `@types` alias.

## Notes

- `./asyncapi.generated` is a **generated artifact** (written by `npm run gen:asyncapi` from `asyncapi.yaml`). Do not hand-edit; regenerate instead. The paired frontend keeps its own copy named identically.
- `@api/models` is likewise generated — treat as read-only.
- Only the auth-context and rate-limit-budget exports are hand-written; the other two star-exports are fully mechanical.
- The barrel is types-only (`export type` for the hand-written entries, star-exports for the generated ones); it carries no runtime code.
