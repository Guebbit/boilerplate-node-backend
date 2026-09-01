# src/modules/locales/controllers/get-locale-messages.ts

## Purpose

Thin HTTP adapter for `GET /locales/:locale/messages`. It translates the Express request into a `localeService.readMessages` call, maps the result onto a standard success/reject response shape, and delegates error formatting to `catchAs`. No business logic lives here.

## Key elements

- **`getLocaleMessages`** (exported function) — Accepts an Express `Request` (locale from `params.locale`, optional `tenant` from `query`) and a `Response`. Calls `localeService.readMessages(locale, tenant?)`, then returns `successResponse` or `rejectResponse` depending on the result's `success` flag. The trailing `.catch(catchAs(response, 'getLocaleMessages'))` handles thrown/rejected errors uniformly.

## Relationships

- **`src/modules/locales/services/index.ts`** — Imports `localeService` and calls its `readMessages(locale, tenant)` method; this is the sole source of data for the endpoint.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` and `rejectResponse` to shape the JSON reply (status + payload or status + errors).
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs`, a generic catch-handler factory used in the `.catch()` tail.
- **`src/modules/locales/routes.ts`** — Wires `getLocaleMessages` to the `GET /locales/:locale/messages` route.

## Notes

- The `tenant` query parameter is optional. When present it is trimmed; an empty string is coerced to `undefined`, letting the service fall back to the deployment's default frontend copy.
- The endpoint is public and cacheable. Admin writes invalidate the `locales` cache tag, so a re-fetch after an edit picks up the new dictionary without manual cache busting.
