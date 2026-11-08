---
source: src/modules/locales/controllers/delete-locale-entry.ts
sha256: cba31a55c6f9c95b4aa2fa7b1a9933406b3b929636899a656fc2bec1a8f3c0e9
generated_at: 2026-11-08T06:20:30.002493+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/delete-locale-entry.ts

## Purpose

Thin HTTP adapter for `DELETE /locales/:locale/apps/:app/entries/:entryId`. It validates the `entryId` parameter, delegates the actual deletion to `localeService.removeEntry`, and returns a `204 No Content` (or a refusal/error status) — no response body.

## Key elements

- **`deleteLocaleEntry(request, response)`** (exported) — The sole handler. Resolves `entryId` via `requireId`, calls `localeService.removeEntry(locale, app, entryId, callerContextOf(request))`, then either short-circuits on a refusal, sends a `204`, or routes the error through `catchAs`.
- **`requireId`** (from `@infrastructure/http/ids`) — Validates/extracts the `entryId` param; sends a 404 with the i18n key `locales.error-entry-not-found` when missing or invalid, and the handler returns early.
- **`callerContextOf`** (from `@infrastructure/http/request`) — Derives audit/context metadata from the request to pass into the service call.
- **`noContentResponse`** (from `@infrastructure/http/response`) — Emits the `204` response on success.
- **`catchAs` / `refused`** (from `@infrastructure/http/controller`) — Standard error/refusal plumbing shared across controllers.

## Relationships

- **`src/modules/locales/services/index.ts`** — Calls `localeService.removeEntry`; the service performs the deletion and (per its own docs) refreshes the overlay on success.
- **`src/modules/locales/routes.ts`** — Registers `deleteLocaleEntry` as the handler for the DELETE route.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` and `refused` for uniform error/refusal handling.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` for audit context extraction.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` for parameter validation.
- **`src/infrastructure/http/response.ts`** — Supplies `noContentResponse` for the 204 reply.

## Notes

- The controller is intentionally stateless: the service layer owns the overlay refresh and audit-trail recording. Do not add side-effects here.
- `requireId` returning a falsy value causes an early `Promise.resolve()` — the 404 is already sent at that point; no further processing occurs.
- Only one language's row for the given key is removed; other locales' rows for the same key are unaffected (documented in the service, not re-checked in the controller).
