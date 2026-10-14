---
source: src/kernel/access/tenant.ts
sha256: 745981cc18505672ae9e872d335dede8538abb8d04e776ddad26ea9b93c26529
generated_at: 2026-10-14T08:20:55.170931+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/access/tenant.ts

## Purpose

Single-constant module that pins the deployment's shop `_id` to one import location. It exists as its own file (rather than living inside `access/service.ts`) to break a circular import: `permissions.ts` needs the constant, and `access/service.ts` already imports from `permissions.ts`.

## Key elements

- **`DEPLOYMENT_TENANT_ID`** (`string`) — the fixed shop `_id` (`'65dd20000000000000000001'`). Every deployment reads this directly instead of resolving a shop at boot (Django `SITE_ID` pattern). Same id format and vintage as the ids in `@scenarios/accounts`.

## Relationships

- **`src/kernel/permissions.ts`** — Consumes `DEPLOYMENT_TENANT_ID` (for `anonymousCaller`, `SYSTEM_ACTOR`). The circular-import avoidance is the reason this file is split out.
- **`src/modules/access/service.ts`** — Contains `ensureTenant`, which writes the id on INSERT only. This file keeps the constant out of `service.ts` so `service.ts → permissions.ts` remains one-directional.
- **`scenarios/users.ts`, `scenarios/webhooks.ts`** — Their fixture ids share the same format and vintage as `DEPLOYMENT_TENANT_ID` (the comment explicitly cross-references `@scenarios/accounts` ids).
- **`src/modules/account/…` (roles, oauth, signup, verification, session)** and **`src/modules/api-keys/…`** tests — Import the constant as the canonical shop identifier in their integration scenarios.

## Notes

- Named for the **deployment**, not the demo. `scripts/db/bootstrap-access.ts` ships in the production image and addresses the shop through this constant; a `DEMO_` prefix would be misleading there.
- The id survives reseeds: `ensureTenant` only sets it on INSERT, and `emptyDatabase()` (never `dropDatabase()`) leaves the row in place. A from-empty reseed recreates the same id rather than minting a new one.
- Because the id is fixed at build time, there is no runtime lookup to cache or configure.
