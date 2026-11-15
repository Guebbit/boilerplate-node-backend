---
source: src/infrastructure/http/middlewares/locale.ts
sha256: 92a31c6b358f7d6d3c6a7ebde12f4d1ce5aa6f95a2db4d5e907eb93af337f9e8
generated_at: 2026-11-14T18:02:30.961374+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/locale.ts

## Purpose

Express middleware that resolves a request's language via `Accept-Language` negotiation and makes the resulting locale and translation function (`t`) available both explicitly on the request object and ambiently through `AsyncLocalStorage`, so that downstream handlers, services, and Zod thunks can all produce user-facing copy in the right language without threading the locale through every call.

## Key elements

- **`attachLocale`** (exported) — The middleware. Negotiates a locale, sets `request.locale` and `request.t`, writes `Content-Language` and `Vary: Accept-Language` on the response, then wraps the rest of the chain in `runWithLocaleContext`.
- **`negotiateLocale`** (internal) — Reads `request.acceptsLanguages(...listServedLocales())`; returns the negotiated string or falls back to `getFallbackLocale()`.
- Imports from `@infrastructure/i18n`: `createLocaleContext`, `getFallbackLocale`, `listServedLocales`, `runWithLocaleContext`.

## Relationships

- **`src/app.ts`** — Mounts `attachLocale` in the middleware chain before routes, so all user-facing handlers run inside the locale context.
- **`src/infrastructure/i18n/index.ts`** — Re-exports the four functions this middleware imports (`createLocaleContext`, `getFallbackLocale`, `listServedLocales`, `runWithLocaleContext`).
- **`src/infrastructure/i18n/catalog.ts`** — Provides `listServedLocales` and `getFallbackLocale` used during negotiation.
- **`src/infrastructure/i18n/context.ts`** — Provides `createLocaleContext` and `runWithLocaleContext`, which produce the `{ locale, t }` object and the `AsyncLocalStorage` binding respectively.
- **`src/infrastructure/i18n/served.ts`** — Supplies the registered/served locale list that `listServedLocales` returns (the candidate list passed to `acceptsLanguages`).
- **`tests/unit/infrastructure/http/middlewares/locale.test.ts`** — Unit tests for `attachLocale` and the negotiation logic.
- **`src/modules/payments/tests/integration/webhook-no-body.test.ts`** — Integration test that exercises the middleware in context (webhook endpoints still go through the locale chain).
- **`src/modules/payments/tests/integration/webhook-rate-limit.test.ts`** — Integration test that exercises the middleware in context (webhook endpoints still go through the locale chain).

## Notes

- The fallback locale is deliberately placed **first** in `listServedLocales()`. `negotiator` answers a bare `*` or missing header with the first candidate offered, so this ordering is what makes both cases resolve to the fallback rather than an arbitrary served locale.
- `negotiateLocale` accepts `Pick<Request, 'acceptsLanguages'>` — a test stub only needs to implement that one method.
- The `Vary: Accept-Language` header mirrors the `Vary: Authorization` convention in `cache.ts`: it tells upstream caches that this header selects the response body.
- A switched-off or unknown language tag falls back exactly like a missing header — there is no error path in negotiation.
