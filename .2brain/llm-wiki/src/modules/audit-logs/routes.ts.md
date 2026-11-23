---
source: src/modules/audit-logs/routes.ts
source_sha256: 703b663f2dc9a9d9c47a0db0a40b50476770db0fe29f1d57834ac043b62eae59
context_sha256: 48566309590b061d99a2c7980f2879e01d4fd7cabb8f99dd9c085b0081bd2c7b
generated_at: 2026-11-22T04:27:51.527526+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/routes.ts

## Purpose
Defines the `/audit` Express router for the audit-logs module. It exposes a single read endpoint, gated on the `read:AuditLog` permission, that returns a shop's own action history to the roles holding that permission. It is not meant for the platform operator.

## Key elements
- `router` — the exported Express `Router`, the tenant-facing audit trail.
- `router.use(getAuth, isAuthOrCredential, requirePermission('read', 'AuditLog'))` — router-level guard chain applied to every route.
- `GET /` (mounted as `GET /audit`) — handled by `getAudit`.

## Relationships
- `src/kernel/middlewares/authorizations.ts` — provides `getAuth`, `isAuthOrCredential` and `requirePermission`, which form the guard chain.
- `src/modules/audit-logs/controllers/get-audit.ts` — provides the `getAudit` handler bound to `GET /`.
- `src/modules/audit-logs/module.ts` — a graph neighbor of this file. The router is presumably mounted there under `/audit`, though this file does not show that.

## Notes
- `isAuthOrCredential` lets machine callers through, such as compliance or SIEM integrations pulling the trail. `read:AuditLog` is treated as an ordinary tenant key.
- The guard follows the same pattern the users module's routes use to guard their whole surface.
- The controller does not read `authContext`.
- The file's doc comment points to a documentation section on the audit-logs pipeline for more detail.
