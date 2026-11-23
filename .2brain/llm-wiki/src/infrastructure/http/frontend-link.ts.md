---
source: src/infrastructure/http/frontend-link.ts
source_sha256: 794ac53093bb84749174519584740a3ccd4b62be014eb462e3bc78441c3f758d
context_sha256: 28e05bda1e51d2fa0c70df4aba8123da63310f1dc5c3c433c394aa04443d5c92
generated_at: 2026-11-22T02:48:11.638696+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/frontend-link.ts

## Purpose
Turns a path template plus parameters into a link into the paired frontend: the frontend's origin, the caller's locale, then the filled-in path. Infrastructure only builds URLs. It does not know which links exist. Modules such as `account` and `orders` own their link kinds, `NODE_FRONTEND_LINK_*` env overrides and default templates, and pass in an already-resolved template.

## Key elements
- `FRONTEND_LINK_RULES`: the default link templates and sitemap static pages, loaded from `shared/rules/frontend-links.yaml` through `loadSharedRules('frontend-links', frontendLinksSchema)`. The paired frontend reads the same file, so a path its router lacks fails there.
- `supportedLocale` (internal): walks `localeCandidatesFor(locale)` (the tag, its base language, then the fallback) and returns the first served one. If none is served it returns `getFallbackLocale()`. For example, `it-CH` becomes `it`.
- `fillPath(template, parameters = {})`: replaces every `{name}` placeholder with the URL-encoded value. Names the template lacks are ignored. It uses a function replacer, so `$&` in a value is treated as plain text. It can also be used on its own to store a screen path, such as `orders/64b7...`, before an origin or locale is known.
- `frontendLink(template, locale, parameters = {})`: returns `${NODE_FRONTEND_URL}/${supportedLocale(locale)}/${fillPath(template, parameters)}`.

## Relationships
- `src/infrastructure/config/shared-rules/load.ts` and `src/infrastructure/config/shared-rules/frontend-links.ts`: supply `loadSharedRules` and `frontendLinksSchema` for `FRONTEND_LINK_RULES`.
- `src/infrastructure/http/config.ts`: `siteConfig().NODE_FRONTEND_URL` provides the origin.
- `src/infrastructure/i18n/index.ts`: provides `getFallbackLocale`, `isServedLocale` and `localeCandidatesFor`, which decide the locale segment.
- `src/modules/account/config.ts` and `src/modules/orders/config.ts`: own the link kinds, env overrides and default templates, and call this file with the template already resolved.

## Notes
- The locale segment is never part of `template`. It always comes first, taken from `locale`, because every frontend route lives under `/:locale`.
- The locale is restricted to served tags because a frontend redirect from a stray tag drops the `#token` fragment of reset, signup and email-change links.
- Templates may carry a fragment, for example `password-reset/confirm#token={token}`.
- The origin is read lazily on each call, so a test can set it after import. The fallback is the frontend's local dev port, not the backend's, the same as `oauthFrontendCallbackBase` in `src/modules/account/oauth/config.ts`.
- Modules may depend downward on this file but not sideways, and infrastructure may not know a module by name.
