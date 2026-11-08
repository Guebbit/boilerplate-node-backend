---
source: src/modules/locales/routes.ts
sha256: c1eaac8a1940077a93a6592ebab01e1fa32246f6d1c63b8daa71dadad2323738
generated_at: 2026-11-08T06:24:24.623625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/routes.ts

## Purpose
Defines the Express router mounted at `/locales`, exposing public locale/translation reads (manifest, messages, dictionary) and authenticated admin writes for languages and their string entries. All routing, middleware ordering, and cache configuration for the locales module lives here.

## Key elements
- **`router`** — the single exported `Router()` instance; mounted at `/locales` upstream.
- **`publicLocaleCache`** — `setCache` preset (1 h, `browserRevalidate`, `scopeKey` via `hasAnonymousReadScope`) shared by the five public GET routes.
- **`messagesCache`** — same as above but adds `keyParameters: ['app']` so the dictionary is cached per app.
- **Route ordering** — `/apps` and `/:locale/messages` are declared *before* `/:locale`; Express first-match would otherwise swallow the wildcard.
- **Permission model** — public reads use only `getAuth` (optional); every write mounts `getAuth → isAuthOrCredential → requirePermission(<verb>, 'Locale'|'Translation')` individually per route (no shared `router.use`).
- **Cache invalidation** — every mutating route calls `invalidateCache(['locales'])` *before* the controller. Entity-translation writes (`PUT`/`PATCH /translations/:entityType/:id`) do **not** carry an `invalidateCache` middleware; the service invalidates its own (entity-type-dependent) tag internally.
- **`/:locale/entries` and `/translations` reads** — intentionally uncached; they feed the live editing screen and are guarded with `update:Locale` / `read:Translation` rather than a public read scope.

## Relationships
- **`@domain-primitives/time`** — imports `HOUR_SECONDS` as the TTL for both cache presets.
- **`@infrastructure/http/middlewares/cache`** — imports `setCache` (builds `publicLocaleCache` / `messagesCache`) and `invalidateCache` (used inline on every write route).
- **`@kernel/access/query`** — imports `hasAnonymousReadScope`, called inside both `scopeKey` closures to let authenticated staff bypass Redis.
- **`@kernel/middlewares/authorizations`** — imports `getAuth`, `isAuthOrCredential`, `requirePermission`; applied per-route as shown above.
- **Controllers (all under `src/modules/locales/controllers/`)** — each route's terminal handler: `get-locales` (getLocales, getLocale, getLocaleDictionary), `get-locale-messages`, `get-locale-apps`, `post-locale` (createLocale), `post-locale-activation` (activate/deactivate), `delete-locale`, `get-locale-entries` (three getters), `post-locale-entry` (createLocaleEntry), `put-locale-entry` (replaceLocaleEntry), `get-entity-translations`, plus `update-locale`, `update-locale-entries`, and `update-entity-translations` controllers imported from sibling files not listed in the graph neighbours.

## Notes
- **`browserRevalidate: true`** on all public reads forces the browser to issue a conditional request (`If-None-Match`) instead of serving its own copy. Without it, an editor's save clears Redis but leaves a stale string in the browser, making saves appear broken.
- **`scopeKey` is "safe by construction"**: two of the five public reads (`/apps`, `/:locale/dictionary`) never see `request.authContext` (no `getAuth` ahead), so they are always guest-equivalent and always hit Redis. The three that do mount `getAuth` can be staff; `hasAnonymousReadScope` returns `false` for them, bypassing Redis so they always get fresh data.
- **No shared `router.use` for auth on writes** — each write route spells out the full middleware chain. This is intentional so the permission string can vary per route (`create` vs `update` vs `delete`).
- **Entity-translation cache tag is dynamic** (varies with `:entityType`), which is why it cannot be expressed in the fixed-array `invalidateCache` middleware and is instead handled inside the service.
- The `replaceLocale` / `updateLocale` / `replaceLocaleEntries` / `updateLocaleEntries` / `replaceEntityTranslations` / `updateEntityTranslations` controllers are imported from `update-locale.ts`, `update-locale-entries.ts`, and `update-entity-translations.ts` — files not present in the provided graph-neighbor list.
