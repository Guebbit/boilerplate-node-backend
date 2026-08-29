# src/modules/locales/controllers/get-locale-messages.ts

## Purpose

HTTP handler for `GET /locales/:locale/messages`. Returns the nested translation dictionary for a given language (and optional tenant) so that a frontend can lazy-load messages it was not bundled with at build time. This is the primary read endpoint the locales module exists to serve.

## Key elements

- **`getLocaleMessages`** (exported) — Express-style handler. Calls `localeService.readMessages(locale, tenant?)`, then maps the service result to a `successResponse` or `rejectResponse`. Any thrown error is routed through `catchAs`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` used to shape the HTTP reply.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the module's uniform error-capture helper (bound to the label `'getLocaleMessages'`).
- **`src/modules/locales/services/index.ts`** — Exports `localeService`; this controller delegates all data access to its `readMessages` method.
- **`src/modules/locales/routes.ts`** — Registers `getLocaleMessages` on the `GET /locales/:locale/messages` route.

## Notes

- `request.query.tenant` is passed through `trim() || undefined`, so an empty `?tenant=` param is treated as "no tenant" (falls back to the deployment default).
- The response body is **nested**, deliberately mirroring the shape of `GET /locales/:locale` so a client needs only one merge path for both tiers.
- The endpoint is public and cacheable (no user-specific data). Freshness is guaranteed by invalidating the shared `locales` cache tag on every admin write.
