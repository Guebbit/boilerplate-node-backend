---
source: src/infrastructure/http/frontend-link.ts
sha256: e25ffee915aae3a84d68837abe98da5d0d947dc69dbad414b58d4d9893e2f3e1
generated_at: 2026-09-27T14:08:59.541346+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/frontend-link.ts

## Purpose

Converts a resolved path template and a set of parameters into a full URL pointing at the paired frontend, prefixed with the caller's locale. It exists so that domain modules never need to know the frontend's origin or how locale validation works—they hand in an already-resolved template and locale, and get back a link.

## Key elements

- **`frontendLink(template, locale, parameters?)`** *(exported)* — Fills every `{name}` placeholder in `template` with `encodeURIComponent`-encoded values from `parameters`, then returns `` `${origin}/${locale}/${path}` ``. The locale segment is always prepended; it is never part of `template`.
- **`frontendOrigin()`** *(internal)* — Returns `process.env.NODE_FRONTEND_URL` or falls back to `http://localhost:8080`. Read lazily inside the function so tests can set the env var after import.
- **`supportedLocale(locale)`** *(internal)* — If `locale` is in the i18n supported list, returns it as-is; otherwise falls back to the deployment default locale (prevents a 404 on the frontend router).

## Relationships

- **`src/infrastructure/i18n/index.ts` → `src/infrastructure/i18n/catalog.ts`** — Imports `getDefaultLocale` and `listSupportedLocales` for locale validation and fallback.
- **`src/modules/account/config.ts`** and **`src/modules/orders/config.ts`** — Upstream callers. Each module owns its own `NODE_FRONTEND_LINK_*` env var names and default templates, resolves them, then calls `frontendLink` with the concrete template, locale, and parameters.
- **`tests/unit/infrastructure/http/frontend-link.test.ts`** — Unit tests for `frontendLink`, including the lazy `NODE_FRONTEND_URL` override.

## Notes

- The `template` argument is expected to be **already resolved** (env-var lookup, default selection). This file performs no further config or env reading for the path itself—only for the origin.
- Parameter names in `parameters` that do not appear in `template` are silently ignored (no substitution, no error).
- The fallback origin port is **8080** (the frontend's local dev port), intentionally not the backend's port.
- Locale is structurally the first path segment after the origin (`/:locale/…`). Callers must not include it in their template.
