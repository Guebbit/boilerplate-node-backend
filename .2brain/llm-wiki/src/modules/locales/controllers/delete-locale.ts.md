---
source: src/modules/locales/controllers/delete-locale.ts
sha256: 8a3c6b0b2d4434940837ac3e29284386fbe3efb00653bd026cec4e14042935ec
generated_at: 2026-09-23T18:48:13.185418+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/delete-locale.ts

## Purpose
Thin HTTP adapter for the `DELETE /locales/:locale` admin endpoint. It translates the Express request into a `localeService.deleteLanguage` call, handles the 409 refusal (active language) via a shared guard, and fires a locale-override refresh on success. All business logic and the "still active" check live in the service layer.

## Key elements
- **`deleteLocale`** (exported) – The sole export. Signature: `(request: Request<{ locale: string }>, response: Response) => void`.
  - Reads `request.params.locale` and `callerContextOf(request)` as inputs to the service.
  - On refusal (409): delegates to `refused(response, result)` and returns early.
  - On success: fire-and-forgets `refreshLocaleOverrides()` (explicitly **not** awaited), then sends `successResponse(response, undefined)` — no response body.
  - On error: funnels through `catchAs(response, 'deleteLocale')`.

## Relationships
- **`src/modules/locales/services/index.ts`** – Provides `localeService.deleteLanguage`, the actual deletion + cascade + active-guard logic this controller delegates to.
- **`src/modules/locales/routes.ts`** – Registers `deleteLocale` on the `DELETE /locales/:locale` route (admin-scoped).
- **`src/infrastructure/http/controller.ts`** – Supplies the `catchAs` and `refused` helpers used for error/refusal handling.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf`, which extracts the authenticated caller's identity for the audit trail.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse` for the 200 (no-body) reply.
- **`src/infrastructure/i18n/index.ts`** – Re-exports `refreshLocaleOverrides` (implemented in `overrides.ts`); called to make this worker stop serving the deleted locale immediately.
- **`src/infrastructure/i18n/overrides.ts`** – The underlying implementation of `refreshLocaleOverrides`; this file does not import it directly (goes through the barrel).

## Notes
- **Fire-and-forget refresh:** `void refreshLocaleOverrides()` is deliberately not awaited. The current worker stops serving the deleted locale right away; other workers catch up on their own scheduled refresh cycle. See the comment referencing `./write-locale-entries.ts` for the analogous pattern.
- **No response body on success:** The count of removed entries is not returned to the client; it is recorded in the audit trail (via the caller context passed to the service).
- **409 guard is in the service, not here:** The controller only *recognises* the refusal via `refused()`; the actual "is the language still active?" check and the cascade it protects both live in `localeService.deleteLanguage`.
- **`catchAs` label:** The string `'deleteLocale'` passed to `catchAs` is used as a log/context tag for error tracing.
