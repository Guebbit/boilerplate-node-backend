---
source: src/infrastructure/http/frontend-link.ts
sha256: 5518f13ae4187910385a45e0f7cd05167c49e182ecc4b5e3ca76c89e51620d16
generated_at: 2026-10-29T02:01:37.252948+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/frontend-link.ts

## Purpose

Builds absolute URLs into the paired frontend application by combining its origin, a locale segment, and a parameterized path template. It exists so that infrastructure-level code (emails, notifications) can construct frontend links without knowing *which* links exist—each module (`account`, `orders`, etc.) owns its own templates and env-var overrides and calls this function with an already-resolved template.

## Key elements

- **`FRONTEND_LINK_RULES`** (exported const) — Loads and validates `shared/rules/frontend-links.yaml` via `loadSharedRules` + `frontendLinksSchema`. The paired frontend reads the same file, so a missing route is a frontend 404, not a backend error.
- **`frontendOrigin()`** (internal) — Returns `siteConfig().NODE_FRONTEND_URL` (the paired frontend's base URL). Read lazily so tests can set the env var after import.
- **`supportedLocale(locale)`** (internal) — Returns the locale if `isServedLocale(locale)` is true, otherwise falls back to `getDefaultLocale()`. Prevents generating a URL segment the frontend router won't match.
- **`frontendLink(template, locale, parameters?)`** (exported) — Substitutes every `{name}` placeholder in `template` with the URL-encoded value from `parameters`, then returns `` `${origin}/${locale}/${path}` ``. Parameters whose names don't appear in the template are silently ignored.

## Relationships

- **`src/infrastructure/http/config.ts`** — Source of `siteConfig()`, which supplies `NODE_FRONTEND_URL`.
- **`src/infrastructure/i18n/index.ts`** (via `@infrastructure/i18n`) — Provides `getDefaultLocale` and `isServedLocale` used by `supportedLocale`.
- **`src/infrastructure/config/shared-rules/frontend-links.ts`** — Exports `frontendLinksSchema`, the Zod schema validating the shared YAML.
- **`src/infrastructure/config/shared-rules/load.ts`** — Exports `loadSharedRules`, the typed YAML loader.
- **`src/modules/account/config.ts`**, **`src/modules/orders/config.ts`** — Owning modules that resolve their `NODE_FRONTEND_LINK_*` env vars and default templates, then call `frontendLink` with the result.
- **`tests/unit/infrastructure/http/frontend-link.test.ts`** — Unit tests for `frontendLink` and locale-fallback behavior.

## Notes

- The locale segment is **always** the first path segment and is never part of the caller's `template`. Every frontend route lives under `/:locale`.
- `replaceAll` uses a **function replacer** (`() => encodeURIComponent(value)`) so that a `$&` (or any `$n`) inside a value is treated as literal text rather than a JS replacement pattern.
- Unknown or disallowed locales are silently replaced with the deployment default rather than throwing—producing a working link in the fallback language is preferred to a 404 in an unserved language.
- The module intentionally does **not** import any specific module (`account`, `orders`, etc.) to stay layer-compliant (see `docs/theory/layers.md`): infrastructure depends downward, never sideways.
