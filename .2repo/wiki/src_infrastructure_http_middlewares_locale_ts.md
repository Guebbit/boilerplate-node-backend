# src/infrastructure/http/middlewares/locale.ts

## Purpose

Express middleware that resolves the client's preferred language once per request (from the `Accept-Language` header) and exposes the result both explicitly on the request object and ambiently via AsyncLocalStorage, so that any downstream code—handlers, services, Zod thunks—can call `t(...)` without threading the locale through parameters.

## Key elements

- **`attachLocale(request, response, next)`** — the sole export. Performs three things:
  1. Negotiates the locale with `negotiateLocale(request.get('accept-language'))`, builds a context with `createLocaleContext`.
  2. Stamps `request.locale` / `request.t` and sets `Content-Language` + `Vary: Accept-Language` response headers.
  3. Invokes `next()` inside `runWithLocaleContext(context, next)`, binding the context to the AsyncLocalStorage for the remainder of the chain.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — barrel import source; provides `createLocaleContext`, `negotiateLocale`, and `runWithLocaleContext`.
- **`src/infrastructure/i18n/context.ts`** — implements the AsyncLocalStorage plumbing (`createLocaleContext`, `runWithLocaleContext`) that makes `t` available without an explicit request reference.
- **`src/infrastructure/i18n/negotiate.ts`** — supplies `negotiateLocale`, the parsing/priority logic behind the `Accept-Language` header.
- **`src/app/request-context.ts`** — declares the `Request` augmentation (adds `locale: string` and `t: (key) => string`) that lets the middleware assign to `request.locale` / `request.t` without a cast.
- **`tests/unit/infrastructure/http/middlewares/locale.test.ts`** — unit tests covering negotiation, header output, and AsyncLocalStorage propagation.

## Notes

- Must be mounted **before** any route handlers; user-facing copy depends on the context already being active.
- The `Vary: Accept-Language` header is intentional cache-control: it tells fronting proxies that `Accept-Language` selects the response body (same rationale as the `Vary: Authorization` note in `cache.ts`).
- `request.t` is the explicit form for code that already holds the `Request`; any other code imports `t` from `@infrastructure/i18n` and receives the same binding through AsyncLocalStorage—no additional plumbing needed.
