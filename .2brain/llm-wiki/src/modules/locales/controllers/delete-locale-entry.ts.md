---
source: src/modules/locales/controllers/delete-locale-entry.ts
sha256: 4ed8a2e498a08853c14ba2f9bc75f7f7315ac7f8d9cc552444a6c4ffed7447d7
generated_at: 2026-10-15T10:41:53.802999+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/delete-locale-entry.ts

## Purpose

Thin HTTP adapter for the admin `DELETE /locales/:locale/apps/:app/entries/:entryId` route. It validates the path parameter, delegates to `localeService.deleteEntry`, and maps the result onto an HTTP response. Exists to keep the route table free of business logic.

## Key elements

- **`deleteLocaleEntry`** (exported) — Express handler. Validates `entryId` via `requireId` (short-circuits with a 404 if missing), calls `localeService.deleteEntry(locale, app, entryId, callerContext)`, then either signals refusal or sends a body-less `200`. Errors are funneled through `catchAs`.

## Relationships

- **`src/modules/locales/services/index.ts`** — Provides `localeService.deleteEntry`, the actual deletion logic (including overlay refresh and audit-trail recording).
- **`src/modules/locales/routes.ts`** — Wires this handler to the `DELETE` route (admin-protected).
- **`src/infrastructure/http/ids.ts`** — `requireId` validates and coerces the `entryId` param, writing a 404 on failure.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts the authenticated caller's identity for the service call.
- **`src/infrastructure/http/response.ts`** — `successResponse` emits the empty 200 body.
- **`src/infrastructure/http/controller.ts`** — `refused` and `catchAs` centralise error/refusal response mapping.

## Notes

- The success response carries **no body**; the removed key is only visible in the audit trail.
- Deletion is scoped to a single language row; other languages retain their own entry for the same key.
- The overlay refresh is handled inside the service layer (see `services/overlay.ts`), not here.
- If `requireId` fails, the handler returns `Promise.resolve()` without invoking the service — no catch/finally side-effects to worry about.
