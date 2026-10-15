---
source: src/modules/account/controllers/post-account-export.ts
sha256: 4e56dbdab0dd2057216c9e03fd2b648ad2340fa6fa83e9eef9567dd81c3621ba
generated_at: 2026-10-15T09:54:29.605074+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-account-export.ts

## Purpose
Thin Express handler for `POST /account/export`. It extracts the caller's id from auth context, delegates to `requestExport`, and writes a `202` response carrying the export's `id` and `status`. All real work lives in the export service; this file only adapts HTTP to that call.

## Key elements
- **`postAccountExport(request, response)`** — the sole export. Reads `request.authContext.id`, calls `requestExport(id, callerContextOf(request))`, then either short-circuits via `refused` or sends a `successResponse` with the result's `data`, `status`, and `message`. Errors are funneled to `catchAs(response, 'postAccountExport')`.

## Relationships
- **`src/modules/account/services/export.ts`** — source of `requestExport`; the actual async export-creation logic. Imported directly (not via the account-service barrel) by design.
- **`src/modules/account/routes.ts`** — mounts `postAccountExport` on the `/account/export` route and attaches `requireFreshAuth` middleware upstream, guaranteeing `authContext` is present.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs` (uniform error serialization) and `refused` (early-return for rejected results).
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, which packages request metadata forwarded into the service call.
- **`src/infrastructure/http/response.ts`** — provides `successResponse`, the standard 2xx writer.

## Notes
- The file deliberately bypasses the account-service barrel; the module docblock points to that barrel's own docblock for the rationale (data-export stays out of `accountService`).
- No validation logic lives here — `requireFreshAuth` on the route is the only identity gate. If you need a new guard, it belongs in `routes.ts`, not in this handler.
- The response is always `202 Accepted` (or a refusal/error); the export file itself is produced asynchronously and delivered by email, so no polling endpoint is expected from this route.
