---
source: src/modules/locales/routes.ts
sha256: e2ac63a53c539da349a086828474243abb6c1d85c3ba7d74303040a4bbc0902e
generated_at: 2026-10-15T10:44:52.522910+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/routes.ts

## Purpose

Express router mounted at `/locales` that exposes locale discovery (public dictionary reads) and full translation administration (CRUD on languages, per-app entries, and entity translations). It exists as the single HTTP surface for all locale-related endpoints, wiring together authorization guards, Redis cache configuration, and controller handlers.

## Key elements

- **`router`** — the exported Express `Router` instance. Mount order is load-bearing: `/apps` and `/:locale/messages` are declared before `/:locale` so Express's first-match doesn't swallow them with the wildcard.
- **`publicLocaleCache`** — `setCache(3600, …)` with empty `keyParameters`, `browserRevalidate: true`, and a `scopeKey` that calls `hasAnonymousReadScope` to bypass Redis for authenticated admins (who see inactive languages). Applied to `GET /`, `/apps`, and `/:locale`.
- **`messagesCache`** — same 3600 s / `browserRevalidate` shape but adds `app` to `keyParameters` so each app's dictionary is cached separately. Applied to `GET /:locale/messages`.
- **Public reads (4 routes)** — `GET /`, `GET /apps`, `GET /:locale/messages`, `GET /:locale`. All anonymous-accessible; only `GET /` also takes `getAuth` so the admin manifest can include inactive languages.
- **Locale CRUD (4 routes)** — `POST /`, `PUT /:locale`, `PATCH /:locale`, `DELETE /:locale`. Each spells `getAuth, isAuthOrCredential, requirePermission('locales.any.*')` inline (no shared `router.use`) and calls `invalidateCache(['locales'])`.
- **Locale-entry routes (7 routes)** — GET/POST/PUT/PATCH on `/:locale/entries` and `/:locale/apps/:app/entries`, plus PUT/DELETE on `/:entryId`. All gated with `locales.any.*` permissions; writes invalidate the `locales` tag. The two entry GETs are deliberately **uncached** (editing-screen reads).
- **Entity-translation routes (3 routes)** — `GET/PUT/PATCH /translations/:entityType/:id`. Permission domain is `translations.any.*`. Cache invalidation is handled **inside the service** (dynamic tag per `entityType`), not by route-level `invalidateCache`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuthOrCredential`, `requirePermission`, the three guards spelled on every write route and on `GET /`.
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `setCache` (two instances here) and `invalidateCache` (called on every write route except entity-translation writes).
- **`src/kernel/access/query.ts`** — `hasAnonymousReadScope` is invoked inside both cache `scopeKey` callbacks to decide whether an authenticated admin should bypass Redis.
- **`src/modules/locales/controllers/*`** — each imported handler (`getLocales`, `getLocaleDictionary`, `getLocaleApps`, `getLocaleMessages`, `createLocale`, `replaceLocale`, `updateLocale`, `deleteLocale`, `getLocaleEntries`, `getAppLocaleEntries`, `createLocaleEntry`, `replaceLocaleEntries`, `mergeLocaleEntries`, `updateLocaleEntry`, `deleteLocaleEntry`, `getEntityTranslations`, `replaceEntityTranslations`, `upsertEntityTranslations`) is the terminal handler for its route.
- **`src/modules/locales/module.ts`** — mounts this `router` onto the application's `/locales` path.

## Notes

- **Route ordering is a contract.** Adding a new `/:param` route after `/:locale` will be shadowed. `/apps` and `/:locale/messages` must stay above `/:locale`.
- **Auth is per-route, not per-namespace.** There is no `router.use(getAuth)` — the four public reads rely on the absence of a guard. Adding a blanket guard will break anonymous dictionary access.
- **`browserRevalidate` is intentional and non-negotiable.** Without it, an editor's save clears Redis but the browser keeps its stale copy, making saves appear broken. The cost is one conditional `304` round-trip per read.
- **Entity-translation cache invalidation lives in the service, not the route.** The tag is dynamic (registry-declared per `entityType`), so `invalidateCache`'s fixed-string array cannot express it. Do not add `invalidateCache` to those routes.
- **`/:locale/entries` reads use `locales.any.update`, not `locales.self.read`.** The read key is held by every visitor (it's how the shop renders); the edit-screen listing must be restricted to the update permission.
