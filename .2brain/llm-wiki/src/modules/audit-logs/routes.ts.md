---
source: src/modules/audit-logs/routes.ts
sha256: 3cd4f762128db22f74e902c9d3aaa4e96b695bfd1d843eac7f719098e7e852ae
generated_at: 2026-10-29T03:18:06.755129+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/routes.ts

## Purpose

Defines the tenant-facing `/audit` Express router. It exposes a single read endpoint (`GET /audit`) that returns a shop's own action history, gated behind the `read:AuditLog` permission. The router is deliberately tenant-scoped, not platform-operator-scoped.

## Key elements

- **`router`** (exported `Express.Router`) — the only public export. Mounted elsewhere (see `module.ts`).
- **Route stack** — `getAuth` → `isAuthOrCredential` → `requirePermission('read', 'AuditLog')` applied via `router.use`, then `GET /` → `getAudit`.
- **`getAudit`** (imported handler) — the sole controller; per the comment it does not read `authContext`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies all three auth/authorization middlewares (`getAuth`, `isAuthOrCredential`, `requirePermission`) that gate the route.
- **`src/modules/audit-logs/controllers/get-audit.ts`** — provides the `getAudit` handler wired to `GET /`.
- **`src/modules/audit-logs/module.ts`** — registers/mounts this `router` in the broader module graph (inferred from the export shape and module convention).

## Notes

- `isAuthOrCredential` is intentionally used instead of a human-only guard so that machine integrations (SIEM, compliance pipelines) can pull the trail with a tenant key.
- The route is mounted at `/` *inside* this router, so the effective path depends on wherever `module.ts` mounts `router` (expected: `/audit`).
- No `authContext` is consumed by the controller; authorization is fully delegated to the middleware chain.
