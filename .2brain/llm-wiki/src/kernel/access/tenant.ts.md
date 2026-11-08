---
source: src/kernel/access/tenant.ts
sha256: f28c34b23ca53dad0bff4d54556ab475c14393e350ca30ad69233234f6d4b181
generated_at: 2026-11-08T03:52:31.115833+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/access/tenant.ts

## Purpose

Single-source home for the deployment's pinned tenant `_id`. Lives in `src/kernel/access/` (not `src/modules/access/services/`) specifically to break a circular import: `permissions.ts` needs the constant, and `access/services/` already imports from `permissions.ts`.

## Key elements

- **`DEPLOYMENT_TENANT_ID`** (`string`, `'65dd20000000000000000001'`) — The one-and-only tenant/shop id for a given database. Named for the *deployment*, not the demo scenario. Every consumer reads this constant directly rather than resolving a tenant row at boot (Django `SITE_ID` pattern: one shop per database, id fixed at build time).

## Relationships

- **`src/kernel/permissions.ts`** — imports this constant (used alongside `anonymousCaller`, `SYSTEM_ACTOR`). This is the circular-import constraint that dictates the file's location.
- **`scripts/db/bootstrap-access.ts`** (not a graph neighbor but referenced in the docstring) — ships in the production image and addresses the shop via this constant.
- **`src/modules/access/services/grants.ts`**, **`memberships.ts`**, **`protection.ts`** — consume the constant to scope access-control rows to the single tenant.
- **`scenarios/webhooks.ts`** and various integration/unit test files — import the constant to target the tenant in test fixtures and assertions.

## Notes

- **Do not rename to a `DEMO_`-prefixed name.** The bootstrap script that ships in production reads this constant; a demo prefix would describe a scenario absent from production.
- **The id is stable across reseeds.** `ensureTenant` only writes the id on INSERT; `emptyDatabase()` (never `dropDatabase()`) leaves the row in place, and a from-empty reseed recreates the same value rather than minting a new one.
- **Do not relocate to `src/modules/access/services/`.** That would re-introduce the circular import between `permissions.ts` ↔ `access/services/`.
