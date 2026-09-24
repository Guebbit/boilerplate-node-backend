---
source: src/modules/audit-logs/routes.ts
sha256: 29d002fb94f786baaf3d5204db09f3291dcb758950ed2719509a0d20dec15d61
generated_at: 2026-09-23T18:27:30.323019+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/routes.ts

## Purpose

Defines the Express router for the tenant-facing `GET /audit` endpoint. It exposes a shop's own action history, restricted to roles that hold the `audit.any.read` permission (a tenant key, not a platform-operator key). The file exists to wire authentication, credential-type validation, and permission gating in front of the single audit-reading controller.

## Key elements

- **`router`** (exported `Router`) — the only export. Mounts a single `GET /` route (`/audit`) handled by `getAudit`.
- **Middleware chain** (`router.use(...)`) — applies `getAuth` → `isAuthOrCredential` → `requirePermission('audit.any.read')` globally to the router, so the one route is always gated.
- **`getAudit`** (imported handler) — the sole route handler, imported from `./controllers/get-audit`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth`, `isAuthOrCredential`, and `requirePermission`; supplies the entire auth/permission gate for this router.
- **`src/modules/audit-logs/controllers/get-audit.ts`** — provides the `getAudit` handler that executes when `GET /audit` matches; the controller does not read `authContext` itself (the router's middleware already resolved identity).
- **`src/modules/audit-logs/module.ts`** — mounts this `router` into the application's route tree (typical module registration pattern).
- **`tests/support/routed-modules.ts`** — includes this router in the test app so integration tests can hit `/audit` through the full middleware chain.

## Notes

- `isAuthOrCredential` is used (rather than a plain user-auth check) so that non-interactive consumers—compliance feeds, SIEM integrations—can pull the trail with a tenant credential. Any holder of `audit.any.read` passes; no further role distinction is made here.
- The comment explicitly references `users/routes.ts` as the guard-pattern precedent; expect the same "gate at the router level, keep the controller thin" convention across modules.
