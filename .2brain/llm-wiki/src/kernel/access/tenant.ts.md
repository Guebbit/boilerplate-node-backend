---
source: src/kernel/access/tenant.ts
sha256: 6707c66d2980c4676790e6304923d1b57c559c6b669baada83c3806802daf514
generated_at: 2026-09-23T17:54:41.655311+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/access/tenant.ts

## Purpose

Exports the single, fixed `_id` for the deployment's tenant (shop). It lives in its own file rather than in `src/modules/access/service.ts` to break a circular import: `src/kernel/permissions.ts` needs the constant (for `anonymousCaller`, `SYSTEM_ACTOR`), and `access/service.ts` already imports from `permissions.ts`.

## Key elements

- **`DEPLOYMENT_TENANT_ID`** (`string`) — the one-shop `_id`, pinned at build time. Every caller that needs the tenant id imports this constant instead of looking it up at boot.

## Relationships

- **`src/kernel/permissions.ts`** — imports `DEPLOYMENT_TENANT_ID` (used by `anonymousCaller`, `SYSTEM_ACTOR`). This file's existence as a separate module is what prevents a circular import between `permissions.ts` and `access/service.ts`.
- **`src/modules/access/service.ts`** — the historical home of this constant; imports it from here now. Its `ensureTenant` sets the id only on INSERT.
- **`scripts/db/access-grant.ts`** (and the sibling `bootstrap-access.ts`) — both ship in the production image and address the shop via this constant.

## Notes

- Named `DEPLOYMENT_` (not `DEMO_`) because the DB scripts that consume it run in production, where the demo scenario is absent.
- The id is stable across reseeds: `emptyDatabase()` does not `dropDatabase()`, so the row persists; even a from-empty reseed recreates this same id rather than generating a new one (Django `SITE_ID` pattern).
- The id's format and vintage match the ids used by `scenarios/accounts`.
