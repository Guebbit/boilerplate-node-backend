---
source: src/modules/access/index.ts
sha256: 5e07aac1f28bb91ca782a58564593feddb0552244849e59ae94134d832aedb25
generated_at: 2026-11-08T03:56:17.950055+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/index.ts

## Purpose

Public barrel (entry point) for the **access** module. By project convention (strategic-DDD rule, §5), this is the *only* file a sibling module may import from the access module — it re-exports the public API while keeping internal implementation files (`repository.ts`, runtime schemas in `model.ts`) unpublished.

## Key elements

- **`export * from './services'`** — Re-exports all value bindings (functions, classes) from `src/modules/access/services/index.ts`. This is the runtime surface other modules get.
- **`export type * from './model'`** — Re-exports *type-only* declarations (e.g. `TenantDocument`, `MembershipDocument`) from `src/modules/access/model.ts`. No runtime code from `model.ts` is exposed; only the TypeScript types.

## Relationships

- **`src/modules/access/services/index.ts`** — Direct upstream; all its exports become the runtime API of the access module.
- **`src/modules/access/model.ts`** — Direct upstream; its types (documents, schemas) are surfaced as type-only exports.
- **`src/modules/account/session/auth-context.ts`, `src/modules/account/roles.ts`, `src/modules/api-keys/services/resolver.ts`, and other neighbor modules** — Consumers that import the access module through this barrel rather than reaching into `model.ts` or `repository.ts` directly.
- **`scripts/db/bootstrap-access.ts`** and **`scenarios/accounts.ts`** — Operational/test entry points that consume the access module's public API.

## Notes

- The `type *` re-export is deliberate: it prevents sibling modules from pulling in `model.ts`'s runtime schema objects (e.g. Mongoose/Drizzle schemas). If you need a runtime value from `model.ts`, it is intentionally not available through this barrel.
- `repository.ts` is not re-exported at all — it is an internal implementation detail.
- The import rule is documented in `docs/theory/strategic-ddd.md` §5; `docs/theory/authorization.md` provides domain context.
