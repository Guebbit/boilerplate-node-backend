---
source: src/infrastructure/http/frontend-link.ts
sha256: f453f6cf179f684cd436de61a7bcd658a5c9ca90cd2a53ff0c36c023ce2776b0
generated_at: 2026-11-08T03:29:24.710630+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/frontend-link.ts

## Purpose

Turns a path template plus parameters into a full URL pointing at the paired frontend, prepending the deployment's origin and a validated locale. It is deliberately generic: it knows *how* to build a frontend URL but not *which* links exist—each module (`account`, `orders`, etc.) owns its own `NODE_FRONTEND_LINK_*` env vars and default templates and calls this with the template already resolved.

## Key elements

- **`FRONTEND_LINK_RULES`** (const) — Loads the shared `frontend-links.yaml` (default templates + sitemap static pages) via the shared-rules loader. The paired frontend reads the same file, so an unknown path 404s on the frontend's router.
- **`fillPath(template, parameters?)`** (exported) — Substitutes every `{name}` placeholder in `template` with the URL-encoded value from `parameters`. Parameters whose name the template does not contain are silently ignored.
- **`frontendLink(template, locale, parameters?)`** (exported) — Composes the final URL: `origin / supportedLocale(locale) / fillPath(template, parameters)`. The locale segment is always prepended; it is never part of `template`.
- **`frontendOrigin()`** (private) — Reads `siteConfig().NODE_FRONTEND_URL` lazily (function call, not a captured value).
- **`supportedLocale(locale)`** (private) — Returns `locale` if `isServedLocale(locale)`, otherwise falls back to `getDefaultLocale()`.

## Relationships

- **`@infrastructure/i18n`** (`index.ts` / `served.ts`) — Provides `isServedLocale` and `getDefaultLocale` for locale validation and fallback.
- **`src/infrastructure/http/config.ts`** — Provides `siteConfig()` to read `NODE_FRONTEND_URL`.
- **`src/infrastructure/config/shared-rules/load.ts`** — Provides `loadSharedRules` used to load `FRONTEND_LINK_RULES`.
- **`src/infrastructure/config/shared-rules/frontend-links.ts`** — Provides `frontendLinksSchema` (Zod schema) for validating the YAML.
- **`src/modules/account/config.ts`**, **`src/modules/orders/config.ts`** — Upstream callers that resolve their own link templates/env vars and pass them to `frontendLink`.
- **`src/modules/notifications/emails.ts`**, **`src/modules/shop-tasks/emails.ts`**, **`src/modules/shop-tasks/services/notices.ts`**, **`src/modules/shop-tasks/services/tasks.ts`** — Downstream consumers that embed `frontendLink` output into email bodies or task payloads.

## Notes

- `fillPath` uses a **function replacer** in `replaceAll` (`() => encodeURIComponent(value)`) so that a literal `$&` inside a parameter value is not interpreted as a JS replacement pattern.
- `frontendOrigin()` is a function, not a top-level const, so `NODE_FRONTEND_URL` is read at call time—tests can set the env var after the module is already imported.
- Extra entries in `parameters` that have no matching `{name}` placeholder are never substituted; the template is the source of truth for which slots exist.
- The locale is **always** the first path segment after origin (`/:locale/...`). Templates must not include a locale segment themselves.
