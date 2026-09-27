---
source: src/modules/locales/controllers/delete-locale-entry.ts
sha256: 9342e830f3a07360bf2021937b41dca4f9fb4d23fdb36a15a643d4ce839ed7cc
generated_at: 2026-09-27T14:57:57.534179+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/delete-locale-entry.ts

## Purpose
Thin HTTP adapter that handles `DELETE /locales/:locale/entries/:entryId` (admin). It extracts route params and caller context from the Express request, delegates to `localeService.deleteEntry`, and writes the HTTP response — no business logic lives here.

## Key elements
- **`deleteLocaleEntry`** — exported Express handler. Calls `localeService.deleteEntry(locale, entryId, callerContext)`, then either:
  - short-circuits via `refused(response, result)` (handles "not found" / permission denials), or
  - sends a `successResponse` with an empty body.
  Errors are funnelled through `catchAs(response, 'deleteLocaleEntry')`.

## Relationships
- **`@infrastructure/http/response`** — provides `successResponse` used for the 2xx reply.
- **`@infrastructure/http/request`** — provides `callerContextOf(request)` to derive the authenticated actor for the service call.
- **`@infrastructure/http/controller`** — provides `refused` (short-circuit on non-success result) and `catchAs` (unified error-to-HTTP mapping).
- **`src/modules/locales/routes.ts`** — registers `deleteLocaleEntry` on the DELETE route (implied by the module doc comment and route param shape).
- **`src/modules/locales/services/index.ts`** — exports `localeService`, whose `.deleteEntry` method performs the actual removal.

## Notes
- Success response carries **no body**; the removed key is recorded in the audit trail instead (per the module doc comment).
- The service layer refreshes the locale overlay on success (`services/overlay.ts`); the controller does not.
- Deleting an entry affects only the given language — other languages retain their own row for the same key.
- Follows the standard `refused → catchAs` control-flow pattern used by other controllers in this codebase.
