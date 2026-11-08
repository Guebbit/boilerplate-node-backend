---
source: src/types/index.ts
sha256: af9aa7dea77c44087d4b9029a59b908ab64bfdb8b579f19a4322a8b0ba5368e1
generated_at: 2026-11-08T09:16:29.728128+00:00
model: ollama:qwen3.8:27b
---

# src/types/index.ts

## Purpose

Public type barrel that consolidates re-exports from generated API models, generated AsyncAPI types, and hand-written domain DTOs into a single import path (`@types`). Consumers never need to know which of the three sources a given type originates from.

## Key elements

- **`export * from '@api/models'`** — re-exports the generated OpenAPI/REST models.
- **`export * from './asyncapi.generated'`** — re-exports generated AsyncAPI event types (produced by `npm run gen:asyncapi` from `asyncapi.yaml`).
- **`export type { AuthContext, AuthorizationScope, Caller, CallerContext, Resolution, ResolveMissReason, ResolveOptions, PlatformCaller, TenantCaller, TenantCallerContext } from './auth-context'`** — transport-safe user/authorization DTO types (DIP: no infra-specific shape leaks to consumers).
- **`export { AUTHORIZATION_SCOPES } from './auth-context'`** — the scope strings as a runtime value, suitable for use in a schema `enum`.
- **`export type { ServerImageFields, WithServerImage } from './server-image'`** — the server-decided image portion of a write; wire `imageUrl` is `null`-only on the client side.
- **`export type { RateLimitBudget } from './rate-limit-budget'`** — shared rate-limit budget shape used by both `kernel/registry.ts` (manifest field) and the infrastructure limiter factory, which is otherwise forbidden from importing kernel.

## Relationships

All listed neighbors are **consumers**: they import types (and in some cases the `AUTHORIZATION_SCOPES` value) from this barrel via the `@types` alias. This file does not import from any of them.

## Notes

- `asyncapi.generated.ts` is a build artifact; regenerate with `npm run gen:asyncapi`. The paired frontend maintains its own copy named identically from its own `asyncapi.yaml`.
- `AUTHORIZATION_SCOPES` is the only **value** re-export in this barrel; everything else is type-only.
- `RateLimitBudget` exists here specifically to break the kernel → infrastructure import cycle (DIP).
- Because this file is a pure barrel, adding a new shared type means adding a new `export type { … } from './…'` line here — do not scatter imports across consumer files.
