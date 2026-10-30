---
source: src/modules/locales/controllers/delete-locale-entry.ts
sha256: cba31a55c6f9c95b4aa2fa7b1a9933406b3b929636899a656fc2bec1a8f3c0e9
generated_at: 2026-10-29T04:19:38.266090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/delete-locale-entry.ts

## Purpose

Thin HTTP adapter that handles `DELETE /locales/:locale/apps/:app/entries/:entryId`. It validates the path parameter, delegates to `localeService.removeEntry`, and maps the service result to an Express response (204 on success, error on refusal). It exists to keep route wiring in `routes.ts` free of business logic.

## Key elements

- **`deleteLocaleEntry`** (exported) — Express handler. Calls `requireId` to extract/validate `entryId`; on failure resolves immediately (no further work). On success calls `localeService.removeEntry(locale, app, entryId, callerContext)`, then either short-circuits via `refused(response, result)` or sends `noContentResponse` (204, no body). Errors are funneled through `catchAs(response, 'deleteLocaleEntry')`.

## Relationships

- **`src/modules/locales/routes.ts`** — registers this controller on the DELETE route.
- **`src/modules/locales/services/index.ts`** — source of `localeService.removeEntry`, the actual deletion logic.
- **`src/infrastructure/http/ids.ts`** — provides `requireId` for safe path-param extraction.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to derive the authenticated caller's context for the service call.
- **`src/infrastructure/http/response.ts`** — provides `noContentResponse` (204).
- **`src/infrastructure/http/controller.ts`** — provides `catchAs` (uniform error → response mapping) and `refused` (checks a service result for a refusal sentinel).

## Notes

- Returns **204 No Content**; there is no response body. The removed key is recorded in an audit trail, not echoed back.
- `requireId` returning `undefined` causes an early `Promise.resolve()` return rather than an explicit 404/400 — the 404 is emitted internally by `requireId` via its `notFound` message key (`locales.error-entry-not-found`).
- The service is responsible for refreshing the locale overlay after a successful deletion (see `services/overlay.ts`); the controller does not trigger that itself.
- Deleting an entry affects only the targeted language; other languages retain their own row for the same key.
