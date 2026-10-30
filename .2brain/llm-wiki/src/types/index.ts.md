---
source: src/types/index.ts
sha256: af9aa7dea77c44087d4b9029a59b908ab64bfdb8b579f19a4322a8b0ba5368e1
generated_at: 2026-10-29T06:36:55.983595+00:00
model: ollama:qwen3.8:27b
---

# src/types/index.ts

## Purpose

Public type barrel for the `@types` import path. It re-exports three distinct sources—generated API models, generated AsyncAPI types, and hand-written domain DTOs—so that every consumer (workers, adapters, scenarios, scripts) imports from one flat path without needing to know which sub-module a type originally lives in.

## Key elements

- **`export * from '@api/models'`** — re-exports all generated API model types.
- **`export * from './asyncapi.generated'`** — re-exports types generated from `asyncapi.yaml` (produced by `npm run gen:asyncapi`).
- **Auth-context types** (from `./auth-context`) — `AuthContext`, `Caller`, `PlatformCaller`, `TenantCaller`, `CallerContext`, `TenantCallerContext`, `AuthorizationScope`, `Resolution`, `ResolveMissReason`, `ResolveOptions`.
- **`AUTHORIZATION_SCOPES`** (value export, from `./auth-context`) — the scope list as a runtime array, usable in a schema `enum`.
- **Server-image types** (from `./server-image`) — `ServerImageFields`, `WithServerImage`; represent the server-decided image half of a write (wire `imageUrl` is always `null`).
- **`RateLimitBudget`** (from `./rate-limit-budget`) — a module's rate-limit budget shape, shared between the kernel manifest and infrastructure's limiter factory.

## Relationships

- **`src/infrastructure/adapters/image-store.ts` / `image.worker.ts`** — consume `ServerImageFields` / `WithServerImage` to model the server-side image payload.
- **`src/infrastructure/adapters/mailer.ts` / `mail-transports.ts` / `email.worker.ts`** — consume `AuthContext` / `Caller` types as the transport-safe user representation.
- **`src/infrastructure/adapters/queue.ts`** — consumes auth-context types for message metadata.
- **`src/app/workers.ts`** — imports type-level context (auth, image) used to type worker handlers.
- **`scripts/docs/generate-rate-limit-budgets.ts`** — uses `RateLimitBudget` to shape the generated budget tables.
- **`scripts/docs/generate-role-matrix.ts`** — uses `AUTHORIZATION_SCOPES` / `AuthorizationScope` to enumerate the role × scope matrix.
- **`scenarios/example.ts`, `scenarios/products.ts`, `scenarios/products-filler.ts`** — import the barrel to type fixtures and assertions in integration scenarios.
- **`scenarios/support/doubles/*`** (mail-outbox, payments fake/levers) — import auth-context types to stub the `Caller`/`AuthContext` passed through request pipelines.

## Notes

- The only **value** export in this barrel is `AUTHORIZATION_SCOPES`; everything else is type-only. Tooling that does `import { AUTHORIZATION_SCOPES } from '@types'` gets a real runtime binding.
- `RateLimitBudget` exists here specifically so infrastructure's limiter factory can reference the shape without importing the kernel module (explicitly called out in the source comment).
- `asyncapi.generated.ts` is a build artifact; do not hand-edit it. Regenerate with `npm run gen:asyncapi` after changing `asyncapi.yaml`.
