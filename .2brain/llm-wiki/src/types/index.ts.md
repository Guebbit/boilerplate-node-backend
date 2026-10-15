---
source: src/types/index.ts
sha256: f89ce006c43a42b918737c76d0db9afa6a33d2c92ba2d489e11e9e1bd9dff41f
generated_at: 2026-10-15T12:29:54.985758+00:00
model: ollama:qwen3.8:27b
---

# src/types/index.ts

## Purpose

A public type barrel that re-exports generated API models, generated AsyncAPI types, and hand-written domain DTOs under a single import path (`@types`). Consumers never need to know which of the three sources a type originates from.

## Key elements

- **`export * from '@api/models'`** — re-exports all generated API request/response models.
- **`export * from './asyncapi.generated'`** — re-exports types generated from `asyncapi.yaml` (via `npm run gen:asyncapi`).
- **Type re-exports from `./auth-context`** — `AuthContext`, `AuthorizationScope`, `Caller`, `CallerContext`, `PlatformCaller`, `RoleLevel`, `Resolution`, `ResolveMissReason`, `ResolveOptions`, `TenantCaller`, `TenantCallerContext`.
- **`AUTHORIZATION_SCOPES`** (value, not type) — the concrete scope list, exported so a schema's `enum` field can reference it at runtime.
- **`WithServerImage`** (from `./server-image`) — the server-decided image half of a write; wire `imageUrl` is `null`-only.
- **`RateLimitBudget`** (from `./rate-limit-budget`) — shared between `kernel/registry.ts`'s manifest field and infrastructure's limiter factory (which is prohibited from importing kernel).

## Relationships

- **Depends on (upstream):** `@api/models` (generated package), `./asyncapi.generated`, `./auth-context`, `./server-image`, `./rate-limit-budget`.
- **Consumed by (downstream):** all listed neighbors — scenario files, infrastructure adapters (`mail-transports`, `mailer`, `queue`, `email.worker`, `image.worker`), `src/app/workers.ts`, `src/infrastructure/http/config.ts`, `src/infrastructure/http/middlewares/rate-limit-store.ts`, and the docs-generation scripts (`generate-rate-limit-budgets.ts`, `generate-role-matrix.ts`) import types through this barrel rather than reaching into the sub-modules directly.

## Notes

- `AUTHORIZATION_SCOPES` is a **value** export, not a type. Consumers importing it for runtime use (e.g., populating a JSON-schema `enum`) should use a value import, not `import type`.
- `RateLimitBudget` exists as a shared type here specifically to break a forbidden dependency: infrastructure's limiter factory cannot import from `kernel/registry.ts`, so both sides import the type from this barrel instead.
- The `asyncapi.generated` file is **not** hand-edited; regenerate with `npm run gen:asyncapi`. The frontend repository maintains its own copy with the same filename, generated from the shared half of the spec.
- All sub-module imports are type-only (`export type`) except `AUTHORIZATION_SCOPES` and the two wildcard `export *` lines, which may carry runtime values from the generated packages.
