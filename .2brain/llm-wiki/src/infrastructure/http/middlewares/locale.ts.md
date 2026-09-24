---
source: src/infrastructure/http/middlewares/locale.ts
sha256: 4c2b728a9ad1e459ee8a0bbe37a04d6f9a97872855ce5a73fcd16d6a7132b88f
generated_at: 2026-09-23T17:44:00.078406+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/locale.ts

## Purpose

Express middleware that resolves the request's language from the `Accept-Language` header once, at the top of the chain, and exposes the result in two channels: explicitly as `request.locale` / `request.t` for handlers that hold the request, and ambiently through AsyncLocalStorage so that services, repositories, and Zod thunks can call `t` (imported from `@infrastructure/i18n`) without threading the request through every call site.

## Key elements

- **`attachLocale(request, response, next)`** *(exported)* — The middleware. Negotiates the locale, writes `request.locale` and `request.t`, sets `Content-Language` and `Vary: Accept-Language` on the response, then invokes `next()` inside `runWithLocaleContext` so the remainder of the chain inherits the binding.
- **`negotiateLocale(request)`** *(module-private)* — Reads `request.acceptsLanguages(...offered)` and returns the best-matching supported locale, falling back to the configured default when nothing matches or the header is absent. Only the `acceptsLanguages` property is required on the input, so unit tests can pass a minimal stub.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Re-exports the four helpers this file consumes: `createLocaleContext`, `getFallbackLocale`, `listSupportedLocales`, `runWithLocaleContext`.
- **`src/infrastructure/i18n/context.ts`** — Provides the AsyncLocalStorage-backed context (`createLocaleContext`, `runWithLocaleContext`) that wraps the downstream handler chain.
- **`src/infrastructure/i18n/catalog.ts`** — Source of `listSupportedLocales()` and `getFallbackLocale()` used to build the negotiation candidate list.
- **`src/app/request-context.ts`** — Defines (or augments) the `Request` type so that `request.locale` and `request.t` are typed properties; this middleware is what populates them at runtime.
- **`tests/unit/infrastructure/http/middlewares/locale.test.ts`** — Unit tests exercising negotiation edge cases (missing header, `*`, q-weights, region-prefix matching, explicit refusal).

## Notes

- The fallback locale is deliberately placed **first** in the array passed to `acceptsLanguages`. Because `negotiator` returns the first candidate for a bare `*` or absent header, this guarantees those cases resolve to the intended default rather than an arbitrary supported locale.
- `runWithLocaleContext(context, next)` wraps the *entire* downstream chain (including `res.send`/`res.json`), so any async work in later middleware or handlers still sees the correct `t`. Forgetting to mount this middleware before routes means those handlers will have no ambient locale.
- The `Vary: Accept-Language` header is the same caching-correctness concern documented for `Vary: Authorization` in `cache.ts`; any upstream cache must key on this header to serve the right language.
