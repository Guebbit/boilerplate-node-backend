---
source: src/modules/locales/controllers/delete-locale.ts
sha256: ea885f8959b6885770fec7c8c02c145926238115a79243ac0884ceb036ad5934
generated_at: 2026-09-27T14:58:06.058264+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/delete-locale.ts

## Purpose

Thin HTTP adapter for the `DELETE /locales/:locale` (admin) endpoint. It extracts the locale param and caller context from the request, delegates to `localeService.deleteLanguage`, and maps the service result onto an Express response. It contains no business logic.

## Key elements

- **`deleteLocale(request, response)`** — sole export. Calls `localeService.deleteLanguage(locale, callerContext)`. On refusal (409) it delegates to `refused`; on success it sends `successResponse(response, undefined)` (empty body). Unhandled rejections are routed through `catchAs(response, 'deleteLocale')`.

## Relationships

- **`@infrastructure/http/controller`** (`controller.ts`) — provides `catchAs` (unified error-to-HTTP mapping) and `refused` (checks a service result for a refusal and writes the appropriate 4xx response).
- **`@infrastructure/http/request`** (`request.ts`) — provides `callerContextOf`, used to extract the authenticated caller's identity for the service call.
- **`@infrastructure/http/response`** (`response.ts`) — provides `successResponse`, used to emit the 200 with no body.
- **`../services`** (`services/index.ts`) — source of `localeService.deleteLanguage`, the actual deletion + cascade logic this controller wraps.
- **`../routes`** (`routes.ts`) — wires `deleteLocale` onto the `DELETE /locales/:locale` route (admin guard).

## Notes

- The 409 "language still active" guard lives **in the service**, not here; this file merely forwards the refusal.
- No body is returned on success; the number of deleted entries is recorded only in the service's audit trail.
- The service is responsible for refreshing the overlay after a successful delete — this controller does not.
