---
source: src/modules/locales/controllers/get-locale-apps.ts
source_sha256: fa4fe7f498398eb733a0618d1eb2ae02875efe31936840333278fd892c8ea4fb
context_sha256: 35541e1edbda5e6b802bf71facd27ad7267d59ea583e0f467b124f5560094d62
generated_at: 2026-11-22T05:42:10.576819+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/get-locale-apps.ts

## Purpose
Express controller for `GET /locales/apps`. It is a thin HTTP adapter that returns every app this deployment holds words for, delegating the lookup to `localeService.listApps()` so the data source can change without the controller knowing. The response is public, cacheable, and identical for every caller (no user data).

## Key elements
- `getLocaleApps(_request, response)` — the exported handler. It calls `localeService.listApps()` and sends `{ apps }` through `successResponse<LocaleApps>`. The request is unused.

## Relationships
- `src/infrastructure/http/response.ts` — provides `successResponse`, which formats the success response.
- `src/modules/locales/services/index.ts` — exports `localeService`, whose `listApps()` supplies the data.
- `src/types/index.ts` — supplies the `LocaleApps` type (imported via the `@types` alias) used as the response payload type.
- `src/modules/locales/routes.ts` — the route module that wires this handler to `GET /locales/apps`.

## Notes
- The doc comment says the app list is read from the environment (see `../apps`), but that lookup happens behind `localeService`, not in this file.
- The handler contains no validation, error handling, or caching code. The "cacheable" claim is documented here, but nothing in this file sets cache headers.
