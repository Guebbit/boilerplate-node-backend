---
source: src/kernel/access/tenant.ts
source_sha256: f28c34b23ca53dad0bff4d54556ab475c14393e350ca30ad69233234f6d4b181
context_sha256: 08c62cfb896b84062b94f0b79154e0a8cc8b42e4402b21d34d81413191f0773d
generated_at: 2026-11-22T03:11:49.564147+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/access/tenant.ts

## Purpose
Defines the single pinned `_id` of the one shop (tenant) in a deployment. It lives in its own file so both `src/kernel/permissions.ts` and `@modules/access/services/` can import it without a circular dependency (`access/services/` already imports from `permissions.ts`).

## Key elements
- `DEPLOYMENT_TENANT_ID` — constant string `'65dd20000000000000000001'`, the shop's fixed `_id`, in the same format and vintage as `@scenarios/accounts`'s ids.

## Relationships
- `src/kernel/permissions.ts` needs the constant (for `anonymousCaller` and `SYSTEM_ACTOR`), which is why the file is separate from the access services.
- `src/modules/access/services/*` (grants, memberships, protection) import from `permissions.ts`, so they could not host this constant without creating a cycle.
- Other listed neighbors (account session/roles/2FA modules, tests, `scenarios/webhooks.ts`) are related via the dependency graph; the file itself only exports the constant.

## Notes
- Named for the deployment, not the demo: `scripts/db/bootstrap-access.ts` ships in the production image and addresses the shop through this id, so a `DEMO_` prefix would be misleading.
- With one shop per database, the id is fixed at build time rather than looked up at boot (the Django `SITE_ID` pattern).
- `ensureTenant` sets the id only on INSERT, so it survives reseeds: `emptyDatabase()` (never `dropDatabase()`) leaves the row in place, and a from-empty reseed recreates the same id.
