---
source: src/infrastructure/http/frontend-link.ts
sha256: dac6f8e4b42927fd2e7365d850e46fa37324b892e0af0230981b01279caeb668
generated_at: 2026-10-14T07:54:02.911763+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/frontend-link.ts

## Purpose

Single-responsibility utility that turns a path template (e.g. `orders/{id}`) plus parameters into an absolute URL pointing at the paired frontend, prefixed with the caller's locale. It lives in infrastructure because it only reads config and i18n data; individual modules (`account`, `orders`) own *which* templates exist and resolve any env-var overrides before calling this function.

## Key elements

- **`frontendLink(template, locale, parameters?)`** (exported) — Replaces every `{name}` placeholder in `template` with the URL-encoded value from `parameters`, prepends the frontend origin and a supported locale segment, and returns the full URL string.
- **`frontendOrigin()`** (internal) — Lazily reads `NODE_FRONTEND_URL` via `siteConfig()`; same pattern as the OAuth callback base in `account/oauth/config.ts`.
- **`supportedLocale(locale)`** (internal) — Returns `locale` if it appears in `listSupportedLocales()`, otherwise falls back to `getDefaultLocale()` so the frontend router doesn't 404 on an unknown locale segment.

## Relationships

- **`src/infrastructure/http/config.ts`** — Source of `siteConfig()`, from which `NODE_FRONTEND_URL` is read at call time (not import time), allowing tests to mutate the env var after import.
- **`src/infrastructure/i18n/index.ts`** (→ `catalog.ts`) — Provides `getDefaultLocale` and `listSupportedLocales` used by `supportedLocale`.
- **`src/modules/account/config.ts`** / **`src/modules/orders/config.ts`** — Downstream callers. Each owns its own `NODE_FRONTEND_LINK_*` env var and default template string, resolves them, and passes the concrete `template` to `frontendLink`. This file never references those modules by name.
- **`tests/unit/infrastructure/http/frontend-link.test.ts`** — Unit tests exercising placeholder substitution, locale fallback, and URL-encoding edge cases.

## Notes

- The function replacer in `replaceAll` (`() => encodeURIComponent(value)`) is intentional: a bare string replacement would interpret `$&`, `` $' ``, etc. in the value as replacement-pattern tokens. The arrow function prevents that.
- The locale is **always** the first path segment and is never expected to be embedded inside `template`. Every route on the paired frontend lives under `/:locale`.
- Because `NODE_FRONTEND_URL` is read through a function (`siteConfig()`) at call time, tests can set the environment variable *after* the module has been imported.
- Per the project's layering rule (`docs/theory/layers.md`), infrastructure may not import from or reference a module by name; template ownership stays in the module layer.
