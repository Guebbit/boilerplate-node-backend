---
source: src/app/routes.ts
sha256: f846da2a3a832e88d1eec80fb393beddc58f2b040cce46f797cd7a53c914c37d
generated_at: 2026-10-14T07:38:44.134201+00:00
model: ollama:qwen3.8:27b
---

# src/app/routes.ts

## Purpose

Single-file route installer for the Express app. It sets a default `Cache-Control: no-store` header, mounts every registered domain module at its self-declared `basePath`, mounts the system router (root ping) at `/`, and registers the 404 catch-all. The file intentionally knows no domain names — modules declare their own paths and routers in their manifests.

## Key elements

- **`installRoutes(app: Express): void`** — the sole export. Runs the install sequence: cache header → module mounts → system routes → 404 handler.
- **Cache header middleware** (inline, no named export) — sets `Cache-Control: no-store` on every response as the safe default. Must run *after* `installStatic` (see Notes), so it lives here rather than in security middleware.
- **Module mount loop** — iterates `enabledModules`; mounts a module only when both `basePath` and `routes` are present. Modules with data but no routes (e.g. `access`) are silently skipped.
- **404 catch-all** — inline handler calling `rejectResponse(response, 404)`. Placed last in this function so no later mount can shadow it.

## Relationships

- **`src/app.ts`** — caller; invokes `installRoutes` during app setup (between `installStatic` and the security/error installers).
- **`src/app/system-routes.ts`** — imported as `systemRoutes`; mounted at `/`. Serves the root ping that belongs to no domain module.
- **`src/modules.ts`** — provides `enabledModules`, the list this file iterates to mount domain routers.
- **`src/infrastructure/http/response.ts`** — provides `rejectResponse`, used by the 404 handler.
- **`tests/integration/scenarios/demo-routes.test.ts`** — integration test that exercises the mounted routes end-to-end.

## Notes

- **Ordering is load-bearing.** The 404 handler is registered *here*, not in the error-handling installer, because it must be the last route. Separating it would let a later mount register behind it and become unreachable.
- **Cache header placement.** Set here (after `installStatic`) so it doesn't clobber the long-lived cache headers `installStatic` applies to images. The bare `setHeader` call is used instead of the `noStore` middleware because that middleware marks the response in a way `setCache`/`privateNoCache` treat as a conflict.
- **Module skip rule.** A manifest carrying only `basePath` or only `routes` is ignored, not an error — both are required for a meaningful mount.
