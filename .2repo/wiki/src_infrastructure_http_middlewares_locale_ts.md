# src/infrastructure/http/middlewares/locale.ts

## Purpose

Express middleware that negotiates the request language from the `Accept-Language` header, exposes the result both explicitly on the request object and ambiently via async-local storage, and sets the two cache-related response headers needed for correct multilingual serving. It must be mounted before all route handlers that produce user-facing copy.

## Key elements

- **`attachLocale(request, response, next)`** — the sole export. Calls `negotiateLocale` on the incoming `Accept-Language` header, builds a locale context via `createLocaleContext`, then:
  - Assigns `request.locale` (string) and `request.t` (translation function) for handlers that prefer explicit access.
  - Sets `Content-Language` to the resolved locale.
  - Appends `Accept-Language` to the `Vary` response header (uses `response.vary` so it coexists with e.g. `Vary: Origin`).
  - Wraps `next()` in `runWithLocaleContext` so that services, repositories, and Zod thunks deeper in the call stack resolve `t` from async-local storage without a parameter.

## Relationships

- **`@infrastructure/i18n`** (barrel → `src/infrastructure/i18n/index.ts`) — provides all three imported symbols; the middleware is the HTTP-side entry point into that module.
- **`src/infrastructure/i18n/negotiate.ts`** — supplies `negotiateLocale`, the Accept-Language parsing/matching logic.
- **`src/infrastructure/i18n/context.ts`** — supplies `createLocaleContext` and `runWithLocaleContext` (the async-local-storage binding).
- **`src/app/request-context.ts`** — where the `request.locale` / `request.t` extensions are declared (the type-level contract this middleware populates).
- **`tests/unit/infrastructure/http/middlewares/locale.test.ts`** — unit tests for the middleware's header, property-assignment, and ALS behavior.

## Notes

- Ordering: must run *before* any handler that emits user-facing strings, but has no dependency on other middlewares.
- `response.vary` (not `response.set`) is used deliberately so it **appends** to any `Vary` value already present (e.g. `Origin` set by CORS middleware).
- `Content-Language` reports what the client *received*, which may differ from what it *asked for* (fallback negotiation).
- The ambient `t` binding via ALS stops working across `await` boundaries that cross process/thread boundaries (e.g. child processes, some queue workers) — see the `@infrastructure/i18n` module docs for the full scope.
