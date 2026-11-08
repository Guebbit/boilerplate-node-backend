---
source: src/infrastructure/http/middlewares/locale.ts
sha256: 9756a092dcd67303d308b840b8a7b014bd9183e22ed87627e32b2bfc686e71c8
generated_at: 2026-11-08T03:31:27.700738+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/locale.ts

## Purpose

Express middleware that resolves the request's language once via `Accept-Language` negotiation and exposes the result in two forms: explicitly on `request.locale` / `request.t`, and ambiently through `AsyncLocalStorage` for downstream code (services, repositories, Zod thunks) that imports `t` directly from `@infrastructure/i18n` without holding a reference to the request.

## Key elements

- **`negotiateLocale`** (internal) — Reads `request.acceptsLanguages(...listServedLocales())`; returns the negotiated string or `getFallbackLocale()` when `false` (no match, explicit refusal, or missing header).
- **`attachLocale`** (exported, the middleware) — Calls `negotiateLocale`, then:
  - Sets `request.locale` and `request.t` for explicit access.
  - Sets `Content-Language` response header and `Vary: Accept-Language`.
  - Wraps `next()` in `runWithLocaleContext(context, next)` to propagate the locale via `AsyncLocalStorage`.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Barrel import source for `createLocaleContext`, `getFallbackLocale`, `listServedLocales`, `runWithLocaleContext`.
- **`src/infrastructure/i18n/context.ts`** — Provides `createLocaleContext` (builds the `{ locale, t }` pair) and `runWithLocaleContext` (the `AsyncLocalStorage` runner).
- **`src/infrastructure/i18n/served.ts`** — Provides `listServedLocales()` (the ordered candidate list, fallback first).
- **`src/infrastructure/i18n/catalog.ts`** — Underlying message catalog that `t` resolves against at call-site.
- **`src/app.ts`** — Mounts `attachLocale` before routes so every handler runs inside the resolved locale.
- **`tests/unit/infrastructure/http/middlewares/locale.test.ts`** — Unit tests for negotiation and middleware behavior.

## Notes

- The fallback locale is positioned **first** in the `listServedLocales()` output so that `negotiator`'s "first candidate wins" rule makes both a bare `*` and a missing header resolve to the fallback rather than an arbitrary served locale.
- `negotiateLocale` reads only `request.acceptsLanguages`, so a test stub needs nothing more than that property.
- `Vary: Accept-Language` is set to prevent shared caches from serving the wrong language body (same class of concern as `Vary: Authorization` in `cache.ts`).
- Per-CLAUDE.md convention, q-weight and region-prefix matching (`en-GB` → `en`) are delegated to Express's `negotiator` rather than reimplemented.
