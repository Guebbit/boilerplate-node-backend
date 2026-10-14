---
source: src/modules/account/controllers/post-account-export.ts
sha256: 5b486977022891238aab60ff1a4bf0000343e4ca8044bcc1fb337dc13ebcce71
generated_at: 2026-10-14T08:33:40.988891+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-account-export.ts

## Purpose

Thin HTTP adapter for `POST /account/export`. It translates the incoming Express request into a `requestExport` call (passing the caller's `id`, `email`, and a derived caller context) and writes back a `202` response with the export job's `id` and `status`. The actual file generation happens asynchronously in the background; a link is emailed when ready.

## Key elements

- **`postAccountExport`** — the sole export. Reads `id` and `email` from `request.authContext` (populated by upstream `isAuth` / `requireFreshAuth` middleware), calls `requestExport(id, email, callerContextOf(request))`, then routes the result through `refused` / `successResponse` / `catchAs` helpers.
- **`callerContextOf(request)`** — extracts a caller-context object (used downstream by the export service for attribution or scoping).

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` (unified error → HTTP response mapping) and `refused` (detects and short-circuits refusal results).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, which builds the context argument passed to the service.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the canonical "write status + body" helper.
- **`src/modules/account/routes.ts`** — mounts `postAccountExport` on the `POST /account/export` path and applies the `requireFreshAuth` guard *before* this handler runs.
- **`src/modules/account/services/export.ts`** — the business-logic layer (`requestExport`). This controller intentionally imports it directly rather than through the `accountService` barrel, keeping the data-export service out of the general barrel's surface.

## Notes

- The file's JSDoc explicitly warns against importing `requestExport` from the `accountService` barrel; always import from `../services/export` here.
- No authorization or input-validation logic lives in this controller. All identity guarantees are enforced by `requireFreshAuth` (mounted in `routes.ts`); the non-null assertion `request.authContext!` is therefore safe by contract, not by a local check.
