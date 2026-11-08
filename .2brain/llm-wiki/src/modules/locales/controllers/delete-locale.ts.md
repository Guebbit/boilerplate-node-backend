---
source: src/modules/locales/controllers/delete-locale.ts
sha256: c18c2089aa065da7c1d1279de123e6180b2fcd4db36a3bfed4f7de38935ba126
generated_at: 2026-11-08T06:20:37.986567+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/delete-locale.ts

## Purpose

Thin HTTP adapter that handles `DELETE /locales/:locale` (admin). It translates the Express request into a call to `localeService.removeLanguage`, maps the service result to an HTTP status (204 on success, 409 on refusal), and delegates error formatting to the shared controller helpers. It exists to keep route wiring in `routes.ts` free of business logic.

## Key elements

- **`deleteLocale(request, response)`** — the sole export. Reads `request.params.locale`, invokes `localeService.removeLanguage` with the caller context, then:
  - returns **204 No Content** (`noContentResponse`) on success,
  - returns **409 Conflict** via `refused` when the service signals the language is still active,
  - delegates unexpected errors to `catchAs(response, 'deleteLocale')` for a uniform error envelope.

## Relationships

- **`src/modules/locales/routes.ts`** — registers `deleteLocale` as the handler for the `DELETE /locales/:locale` route (admin-gated).
- **`src/modules/locales/services/index.ts`** — source of `localeService.removeLanguage`; this file is its only HTTP-facing consumer. The service also performs the cascade delete and refreshes the overlay (see `services/overlay.ts`).
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` (error → HTTP mapping) and `refused` (detects the 409 guard result and writes the response).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to extract identity/tenant metadata from the request for audit purposes.
- **`src/infrastructure/http/response.ts`** — supplies `noContentResponse`, the standard 204 writer.

## Notes

- No response body is ever written on success; the number of removed entries is recorded only in the audit trail (inside the service).
- The 409 guard ("language still active") is enforced **in the service**, not here — this controller only checks the returned flag via `refused`.
- The overlay refresh after a successful delete is the service's responsibility, not the controller's.
