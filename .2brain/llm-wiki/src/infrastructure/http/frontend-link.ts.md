---
source: src/infrastructure/http/frontend-link.ts
sha256: 2c4144fed308f0d3ca663d093fa5dc06e898a34b04d07b2e30d6d591fb1dcf98
generated_at: 2026-11-14T18:00:19.564376+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/frontend-link.ts

## Purpose

Builds a full URL into the paired frontend from a path template, a locale, and key-value parameters. It is the single place where origin + locale segment + encoded path are assembled. Modules own *which* links exist (their `NODE_FRONTEND_LINK_*` env vars and default templates); this file only knows how to render a template into a URL, keeping infrastructure free of module-specific knowledge.

## Key elements

- **`FRONTEND_LINK_RULES`** – Default link templates and sitemap static pages, loaded from `shared/rules/frontend-links.yaml` via the shared-rules loader. The paired frontend reads the same file, so a missing route fails in the frontend router, not in a user's inbox.
- **`fillPath(template, parameters)`** – Substitutes every `{name}` placeholder in the template with its URL-encoded value. Uses a function replacer so a literal `$&` in a value is treated as text, not a replacement pattern.
- **`frontendLink(template, locale, parameters)`** – Main export. Returns `${NODE_FRONTEND_URL}/${servedLocale}/${filledPath}`. The locale segment is always first and is never part of the template.
- **`supportedLocale(locale)`** *(internal)* – Walks the locale → base language → fallback chain and returns the first tag the shop serves. Guarantees the URL segment is a served tag, preventing a redirect that would drop a `#token` fragment.

## Relationships

- **`@infrastructure/http/config`** – `siteConfig()` supplies `NODE_FRONTEND_URL`; read lazily so tests can set the env var after import.
- **`@infrastructure/i18n`** (`catalog`, `served`, `index`) – `getFallbackLocale`, `isServedLocale`, `localeCandidatesFor` power the locale-resolution step.
- **`../config/shared-rules/load`** + **`../config/shared-rules/frontend-links`** – `loadSharedRules` + `frontendLinksSchema` produce `FRONTEND_LINK_RULES`.
- **`src/modules/account/config.ts`**, **`src/modules/orders/config.ts`**, **`src/modules/products/config.ts`** – Each owns its own `NODE_FRONTEND_LINK_*` defaults and calls `frontendLink` / `fillPath` with an already-resolved template.
- **`src/modules/notifications/emails.ts`**, **`src/modules/notifications/staff-routing.ts`**, **`src/modules/shop-tasks/emails.ts`**, **`src/modules/shop-tasks/services/notices.ts`**, **`src/modules/shop-tasks/services/outcome-unknown.ts`** – Downstream consumers that build mail links through this module.
- **`src/modules/notifications/tests/unit/staff-routing.test.ts`** – Exercises `frontendLink` indirectly via staff-routing.

## Notes

- The origin is resolved via `siteConfig()` at call time (not at import), so a test that sets `NODE_FRONTEND_URL` after import still takes effect. Fallback is the frontend's local dev port, not the backend's.
- `fillPath` ignores parameters whose name does not appear in the template; it never throws on extra keys.
- The locale segment is injected here, not by the caller. Every route on the paired frontend lives under `/:locale`, so the segment is structural, not optional.
