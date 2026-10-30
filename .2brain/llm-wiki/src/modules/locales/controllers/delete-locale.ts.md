---
source: src/modules/locales/controllers/delete-locale.ts
sha256: c18c2089aa065da7c1d1279de123e6180b2fcd4db36a3bfed4f7de38935ba126
generated_at: 2026-10-29T04:19:45.500158+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/delete-locale.ts

## Purpose

Thin HTTP adapter that exposes `DELETE /locales/:locale` (admin) by delegating to `localeService.removeLanguage`. It translates the service's result into an Express response (204 on success, 409 if the language is still active) and maps errors to a standard JSON error shape. No business logic lives here.

## Key elements

- **`deleteLocale`** — The sole export. Accepts Express `Request<{ locale: string }>` and `Response`, calls `localeService.removeLanguage(locale, callerContext)`, then:
  - returns **409** via `refused()` when the service signals the language is still active,
  - returns **204 No Content** via `noContentResponse()` on success,
  - delegates any thrown error to `catchAs(response, 'deleteLocale')`.

## Relationships

- **`src/modules/locales/routes.ts`** — Registers `deleteLocale` as the handler for the `DELETE /locales/:locale` route.
- **`src/modules/locales/services/index.ts`** — Source of `localeService`; this controller is the only HTTP entry point that calls `removeLanguage`.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts the authenticated caller's identity for audit/permission context.
- **`src/infrastructure/http/response.ts`** — Provides `noContentResponse` (204 with no body).
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (error → JSON error response) and `refused` (service-level 409 guard).

## Notes

- The 409 "language still active" guard is **intentionally in the service layer**, not here; the controller only forwards the refusal signal.
- The response body is always empty on success; the number of removed entries is recorded in the audit trail by the service, not echoed to the caller.
- `localeService.removeLanguage` also refreshes the translation overlay on success (see `services/overlay.ts`); this is a side-effect of calling the service, not something the controller orchestrates.
