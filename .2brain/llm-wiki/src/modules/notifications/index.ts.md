---
source: src/modules/notifications/index.ts
sha256: 0128a42510b1e7f5dcc69296936f7e1bd2b58ee98e873090fcc71f2ad6dd7a30
generated_at: 2026-11-08T06:31:34.233925+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/index.ts

## Purpose

Public barrel (re-export surface) for the **notifications** bounded context. It is the *only* entry point a sibling module is allowed to import from, enforcing the module boundary described in `docs/theory/strategic-ddd.md` §5. Siblings that need to inform a user typically emit a domain event; those that write a notice directly or query who is staffed on a set call the service re-exported here.

## Key elements

- **`export * from './services'`** — Re-exports the notification service (the callable API for writing notices / reading staff assignments). Resolves to `src/modules/notifications/services/index.ts`.
- **`export * from './emails'`** — Re-exports email-related exports (likely email templates or send helpers).
- **`export type * from './model'`** — Type-only re-export of the domain model (interfaces, type aliases). No runtime values leak.
- **`export type * from './presenter'`** — Type-only re-export of presentation-layer types (view-model shapes, formatters' signatures).

## Relationships

- **`notifications/services/index.ts`, `notifications/emails.ts`, `notifications/model.ts`, `notifications/presenter.ts`** — The four modules this barrel re-exports. This file is the sole public face of all of them.
- **`shop-tasks/services/digest.ts`**, **`shop-tasks/services/notices.ts`**, **`shop-tasks/staff-routing.ts`** — Sibling consumers that import through this barrel to write notices or query staff assignments.
- **`shop-tasks/tests/integration/*`** and **`shop-tasks/tests/unit/staff-routing.test.ts`** — Integration/unit tests that exercise the notifications service via this barrel.

## Notes

- The JSDoc `@module` tag and the strategic-DDD reference make the boundary rule explicit: if you find code importing `notifications/services` directly from a sibling, it is violating the convention this file enforces.
- `model` and `presenter` use `export type *` (TypeScript 5.0+ syntax), meaning only types flow out. If you need a runtime value from those files, it is intentionally not reachable through this barrel.
- No logic lives here; the file is purely declarative re-exports.
