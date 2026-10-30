---
source: src/infrastructure/http/middlewares/locale.ts
sha256: 9756a092dcd67303d308b840b8a7b014bd9183e22ed87627e32b2bfc686e71c8
generated_at: 2026-10-29T02:03:16.208537+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/locale.ts

## Purpose

Express middleware that negotiates the request language (from `Accept-Language`) once, at the top of the chain, and exposes the result both explicitly (`request.locale`, `request.t`) and ambiently via `AsyncLocalStorage`, so that any downstream code—handlers, services, Zod thunks—can call `t` without threading the request object.

## Key elements

- **`attachLocale(request, response, next)`** — the exported middleware. Calls `negotiateLocale`, builds a locale context, stamps `request.locale`/`request.t`, sets `Content-Language` and `Vary: Accept-Language` on the response, then runs `next` inside `runWithLocaleContext`.
- **`negotiateLocale(request)`** — internal helper. Delegates to `request.acceptsLanguages(...listServedLocales())`; returns the negotiated string or falls back to `getFallbackLocale()` when the result is `false`.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — barrel import source for `createLocaleContext`, `getFallbackLocale`, `listServedLocales`, and `runWithLocaleContext`.
- **`src/infrastructure/i18n/context.ts`** — defines `createLocaleContext` and `runWithLocaleContext`, which this middleware calls to build the per-request binding and wrap the remaining chain in `AsyncLocalStorage`.
- **`src/infrastructure/i18n/served.ts`** — source of `listServedLocales()` (the ordered candidate list passed to `acceptsLanguages`) and `getFallbackLocale()` (the last-resort value).
- **`src/app.ts`** — mounts `attachLocale` ahead of route registration so every handler runs inside the resolved locale.
- **`tests/unit/infrastructure/http/middlewares/locale.test.ts`** — unit tests covering negotiation, fallback, and header behaviour.

## Notes

- The fallback locale is placed **first** in `listServedLocales()`'s output, so a bare `*` or a missing header resolves to the fallback rather than an arbitrary served locale (this is a `negotiator` quirk the ordering compensates for).
- `request.acceptsLanguages` (Express's `accepts`/`negotiator`) handles q-weights, `*`, and region-prefix matching; the middleware does **not** re-implement that logic.
- A request whose header explicitly refuses all offered languages (e.g. `Accept-Language: de;q=0`) yields `false` from `acceptsLanguages`, which is treated identically to no header—both fall back.
- `Vary: Accept-Language` is set alongside `Content-Language`; any reverse proxy or CDN caching the response must vary on that header, analogous to the `Vary: Authorization` note in `cache.ts`.
