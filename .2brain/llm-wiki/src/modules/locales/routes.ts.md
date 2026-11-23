---
source: src/modules/locales/routes.ts
source_sha256: 2ef4f172ec872175ddfbb8f02038558dcb6396917c23299f0ffa33e3a3911090
context_sha256: 0e7db93327ca52eafa92dc6a78a1436b4046d2b1c1d32ef8a59ab974db67ddd3
generated_at: 2026-11-22T05:46:33.584581+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/routes.ts

## Purpose
Express router (mounted at `/locales`) for locale discovery and translation administration. Public GET reads serve dictionaries and the language manifest, and are cached in Redis. Every write is permission-gated and invalidates the relevant cache tags.

## Key elements
- `router` — the exported Express `Router`.
- `MANIFEST_TAG` — cache tag (`locales:manifest`) for list-wide answers (the manifest and `/apps`). Every language write clears it.
- `localeTag(locale)` — builds `locale:<canonical>` using `canonicalLocale`, so `PT-br` and `pt-BR` share one tag.
- `languageTags(request)` — tag resolver that reads `:locale` from the path.
- `clearLanguage` — `invalidateCache` middleware that clears the path's language tag and the manifest tag.
- `clearCreatedLanguage` — the same for `POST /locales`, where the tag comes from the body (via `bodyRecordOf`). If the body has no string tag, it clears only the manifest.
- `messagesCache` — `setCache` for `/:locale/messages`. It keys on `?app=`.
- `publicLocaleCache(tags)` — factory for the one-hour public caches. They are language-neutral and set `browserRevalidate`. Each has a `scopeKey` built on `hasAnonymousReadScope`.
  - `manifestCache` — built with `MANIFEST_TAG`.
  - `languageCache` — built with `languageTags`.
- Routes:
  - **Public reads:**
    - `GET /`
    - `GET /apps`
    - `GET /:locale/messages`
    - `GET /:locale/dictionary`
    - `GET /:locale`
  - **Language writes:**
    - `POST /`
    - `PUT`, `PATCH` and `DELETE /:locale`
    - `POST /:locale/activate` and `POST /:locale/deactivate`
  - **Entry routes under `/:locale/apps/:app/entries[/:entryId]`:**
    - GET list and GET one
    - POST
    - PUT and PATCH on the list
    - PUT and DELETE on one entry
  - **Entity translations:** `GET`, `PUT` and `PATCH /translations/:entityType/:id`.

## Relationships
- **Controllers** in `./controllers/*` implement every handler. The router only wires middleware to them (`get-locales`, `get-locale-messages`, `get-locale-apps`, `get-locale-entries`, `post-locale-activation`, `delete-locale`, `delete-locale-entry`, `get-entity-translations`, and others).
- **`@kernel/middlewares/authorizations`** supplies `getAuth`, `isAuthOrCredential` and `requirePermission`.
- **`@infrastructure/http/middlewares/cache`** supplies `setCache`, `invalidateCache` and the `CacheTags` type.
- **`@kernel/access/query`** supplies `hasAnonymousReadScope`, which the cache `scopeKey` functions use to tell a caller with more than anonymous read scope from a guest.
- **`@infrastructure/http/request`**: `bodyRecordOf` reads the tag from the body for `POST /locales`.
- **`@infrastructure/i18n`**: `canonicalLocale` normalizes tags.
- **`@domain-primitives/time`**: `HOUR_SECONDS` is the cache TTL.

## Notes
- **Route order matters.** `/apps` and `/:locale/messages` (and `/:locale/dictionary`) are declared before `/:locale`, so the wildcard does not capture them. `/translations/...` routes are declared last.
- **Auth is spelled per route.** Writes list `getAuth, isAuthOrCredential, requirePermission(...)` individually, not through a shared `router.use`.
- **`getAuth` on public reads.** `GET /`, `/:locale`, and `/:locale/messages` use `getAuth` alone, so an unauthenticated request still gets an answer. Staff additionally see inactive languages. `scopeKey` bypasses Redis for those callers. `/apps` and `/:locale/dictionary` have no `getAuth`.
- **`browserRevalidate`** is deliberate. Without it, an editor's save clears Redis but the browser keeps serving its own copy, which looks like saving is broken. It costs one conditional request per read, answered `304` when nothing changed.
- **Entries and translations reads are uncached.** They are editing screens.
- **Entries reads require `update:Locale`**, not `read:Locale`, because every visitor holds the read key and these routes list every string.
- **Entity-translation routes do not use `clearLanguage`.** Their cache tag comes from the translatables registry per `entityType`, and the service invalidates it, not this router. Their permissions are `read` and `update` on `Translation`.
- **Language activation** uses `update:Locale`, the same as editing. It was the same PATCH until `active` left the body.
