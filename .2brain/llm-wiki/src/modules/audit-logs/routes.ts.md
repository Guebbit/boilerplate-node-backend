---
source: src/modules/audit-logs/routes.ts
sha256: 3cd4f762128db22f74e902c9d3aaa4e96b695bfd1d843eac7f719098e7e852ae
generated_at: 2026-11-08T05:09:07.854882+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/routes.ts

## Purpose

Defines the tenant-facing `/audit` Express router: a single read-only endpoint that exposes a shop's own action history to roles holding the `read:AuditLog` permission. It exists to separate audit-log access from the platform operator's surface and to permit machine consumers (compliance, SIEM) alongside human users.

## Key elements

- **`router`** (exported) — The Express `Router` instance mounted elsewhere (see `module.ts`). All routes and middleware live on this object.
- **`router.use(getAuth, isAuthOrCredential, requirePermission('read', 'AuditLog'))`** — Router-level guard applied before any route. Accepts either a user session or a credential (API key) and requires the `read:AuditLog` permission.
- **`GET /`** — The sole route; delegates to the `getAudit` controller. No path parameters or query parsing at the route level.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Source of all three middleware imports (`getAuth`, `isAuthOrCredential`, `requirePermission`). This file performs no permission checks of its own.
- **`src/modules/audit-logs/controllers/get-audit.ts`** — Provides the `getAudit` handler wired to `GET /`. The controller does not read `authContext`, relying entirely on the router's middleware chain for identity and access.
- **`src/modules/audit-logs/module.ts`** — The presumed mount point that registers `router` onto the application under the `/audit` path (standard module pattern).

## Notes

- The router applies middleware via `router.use(...)`, so the permission gate covers every future route added here automatically — no per-route `requirePermission` needed.
- `isAuthOrCredential` is the key detail: the endpoint is intentionally reachable by non-interactive credentials (machine/SIEM pulls), not only browser sessions. Any new consumer should be checked against this before adding a separate auth path.
- The controller is contractually expected to ignore `req.authContext`; do not add logic in `getAudit` that assumes a user-scoped session.
