---
source: tests/support/contract-routes.ts
sha256: 1833d116dcc38611ca3bb34a7ec0a7fef9ac815517bf68f6d97d918b16c269a9
generated_at: 2026-10-29T07:07:00.276887+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract-routes.ts

## Purpose

Provides a flattened, guard-aware inventory of every HTTP endpoint mounted by any enabled module. It exists as a lightweight contract-layer view of the route table so that authorization, ownership, and security tests can assert against the full endpoint surface without paying the startup cost (event subscriptions, demo seeding) that `enabledModules` carries for the full app.

## Key elements

- **`MountedRoute` (interface)** — Shape of one endpoint row: `method` (uppercased HTTP verb), `path` (absolute, `basePath` + router path), `guards` (router-level + per-route guards in execution order), `permissions` (the `PermissionAsk[]` every `requirePermission` guard on the route asks; empty if none).
- **`everyMountedRoute()` (function, no args)** — Flattens `enabledModules` → each module's `mounts` → each mount's `routes` through `effectiveRouteTable`, returning a `MountedRoute[]` with one entry per method/path pair.

## Relationships

- **`src/modules.ts`** — Imports `enabledModules` to enumerate which modules (and their `basePath` / `routes`) are active.
- **`tests/support/routes.ts`** — Imports `effectiveRouteTable` (the per-router guard-chain resolver) and the `PermissionAsk` type. This file deliberately wraps rather than re-exports that table so callers never trigger the full-module side effects that live in `@tests/routes`.
- **`tests/contract/authorization-contract.test.ts`, `tests/contract/ownership-contract.test.ts`, `tests/cross-cutting/api-key-security.test.ts`, `tests/cross-cutting/identity-guards-follow-the-spec.test.ts`** — Consume `everyMountedRoute` / `MountedRoute` to iterate the entire endpoint surface and assert guard or permission invariants per route.

## Notes

- Walks each module's **own** router, not the assembled Express `app`. `app.use(basePath, router)` nests the router as a single opaque middleware layer, so `effectiveRouteTable` would see only one entry instead of the module's individual routes.
- A module whose `mounts` field is absent is treated as `[]` (default in the `flatMap`), so modules that export no mounts contribute zero rows without crashing.
- `guards` is the concatenation `[...applies, ...chain]` — router-level guards first, then per-route guards — matching runtime execution order.
