---
source: src/kernel/access/tenant.ts
sha256: f28c34b23ca53dad0bff4d54556ab475c14393e350ca30ad69233234f6d4b181
generated_at: 2026-10-29T02:18:36.663477+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/access/tenant.ts

## Purpose

Single-constant module that pins the one-shop `_id` every caller in the codebase needs. It lives in its own file (rather than under `src/modules/access/services/`) specifically to break a circular import: `permissions.ts` needs the ID, and `access/services/` already depends on `permissions.ts`.

## Key elements

- **`DEPLOYMENT_TENANT_ID`** (`'65dd20000000000000000001'`) — the fixed tenant/shop ID for the single-shop-per-database model. Every deployment reads this constant directly (Django `SITE_ID` pattern) instead of looking the shop up at boot. The ID format and vintage match `scenarios/accounts` ids.

## Relationships

- **`src/kernel/permissions.ts`** — Consumes `DEPLOYMENT_TENANT_ID` (for `anonymousCaller` and `SYSTEM_ACTOR`). This is the reason the constant lives outside `access/services/`: that services directory already imports from `permissions.ts`, so putting the ID there would create a cycle.
- **`src/modules/access/services/grants.ts`**, **`memberships.ts`**, **`protection.ts`** — Part of the `access/services/` layer that imports from `permissions.ts`; they (or their callers) read the tenant ID from this module rather than re-exporting it from `permissions.ts`.
- **`src/modules/account/roles.ts`**, **`auth-context.ts`**, **`listing.ts`**, **`two-factor-enrollment.ts`** — Downstream consumers that address the shop by this constant when scoping queries or building request context.
- **`scenarios/webhooks.ts`** — Uses the constant to bind webhook payloads to the single tenant.
- **Test files** (`access.test.ts`, `protection.test.ts`, `idle-timeout.test.ts`, `self-service.test.ts`, `activity.test.ts`, `revoked-by-account.test.ts`) — Import the constant to target the tenant in assertions and setup.

## Notes

- **Naming is deployment-scoped, not demo-scoped.** `scripts/db/bootstrap-access.ts` ships in the production image and addresses the shop through this constant; a `DEMO_` prefix would describe the one scenario guaranteed absent in production.
- **The ID is write-once per row.** `ensureTenant` sets it only on INSERT, so reseeds never change it. `emptyDatabase()` truncates collections without `dropDatabase()`, leaving the row in place; even a from-empty reseed recreates the same ID rather than minting a new one.
- **Do not move the export.** Relocating the constant into `permissions.ts` or `access/services/` reintroduces the circular import the file was created to avoid.
