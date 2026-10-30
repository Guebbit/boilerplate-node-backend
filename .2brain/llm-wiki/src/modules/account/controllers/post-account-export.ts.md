---
source: src/modules/account/controllers/post-account-export.ts
sha256: f891b9037b461a274cf4fb0e3b041c40da59f06457a16f7b6a2f2a3bc7542a71
generated_at: 2026-10-29T02:29:11.762108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-account-export.ts

## Purpose

Thin Express controller for `POST /account/export`. It extracts the caller's ID from the auth context, delegates to `requestExport`, and returns a `202` with the export status and a `Location` header. All real work (building the export file, mailing a link) happens asynchronously in the service layer.

## Key elements

- **`postAccountExport(request, response)`** — The sole export. Reads `request.authContext!.id`, calls `requestExport(id, callerContextOf(request))`, sets `Location: /account/export`, and responds via `successResponse`. Uses `refused` for early-exit refusal paths and `catchAs` for the catch handler.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (error → HTTP mapping) and `refused` (domain-refusal → HTTP response) helpers.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf(request)` to pass through caller metadata to the service.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` used to emit the final `202` body.
- **`src/modules/account/routes.ts`** — Registers this handler on `POST /account/export`, with `requireFreshAuth` middleware guaranteeing a populated `authContext`.
- **`src/modules/account/services/export.ts`** — Provides `requestExport`, the business-logic entry point that actually schedules the export.

## Notes

- `requestExport` is imported **directly** from `../services/export`, not via the `accountService` barrel. The docblock states the data-export service is intentionally kept out of that barrel.
- `request.authContext!` uses a non-null assertion; safety is guaranteed by the `requireFreshAuth` route middleware, not by a runtime check here.
- The response is `202 Accepted` with a `Location` header (RFC 9110 §15.3.3), not a direct file download — the client is expected to poll or await the emailed link.
