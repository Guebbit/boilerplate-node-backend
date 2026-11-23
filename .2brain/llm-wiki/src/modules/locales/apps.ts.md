---
source: src/modules/locales/apps.ts
source_sha256: 87e769eb54f554dbb4e2c2f069f08f63a41a64fc6342ad137f583befc5a825f7
context_sha256: b9d802dd5c8049e95dd734971d69386813e92859fa2aded1ebc4e217549e48c3
generated_at: 2026-11-22T05:41:20.908207+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/apps.ts

## Purpose
Defines which apps (keyspaces) this deployment holds translations for. An app is one consumer of the translation service; entries are identified by (language, app, key), so two apps can share a key with unrelated meanings. The app set is configuration (environment variables), not database data, so an admin or import typo can't create a keyspace nobody serves. Exactly one app is the `backend`; all others are `frontend`. `GET /locales/apps` publishes the full list.

## Key elements
- `backendApp()` returns the API's own app id from `NODE_LOCALE_APP_BACKEND` (default `demo-be`).
- `frontendApp()` returns the default frontend app id from `NODE_LOCALE_APP_FRONTEND` (default `demo-fe`). It is used when a client doesn't say which app it wants.
- `listApps()` returns all `LocaleAppDescriptor`s, in this order: backend (label `API`), default frontend (label `Frontend`), then extras. Duplicate ids are dropped and the first occurrence wins.
- `frontendAppIds()` returns the ids of every `frontend`-kind app. These are the rows `entryCount` counts and the ones the messages route may serve.
- `isKnownApp(id)` is true if the id is any configured app.
- `isFrontendApp(id)` is true if the id is a frontend app, meaning its dictionary may be served.
- `extraFrontendApps()` is private. It parses `NODE_LOCALE_APPS_EXTRA`, a list of `id=Label` pairs such as `mobile=Mobile app,kiosk=Store kiosk`. The label is optional and falls back to the id.

## Relationships
- Reads all its values through `localesConfig()` in `./config`.
- Uses `LocaleAppKind`, `LocaleApp` and `LocaleAppDescriptor` from `@types` (`src/types/index.ts`).
- Its siblings in `services/` and the repository are the likely consumers of these helpers. The file's own comments name the `entryCount` count and the messages route as users of `frontendAppIds`.
- Covered by `src/modules/locales/tests/unit/apps.test.ts` and `apps.fixture.ts`.

## Notes
- Nothing is cached. Every call re-reads config and rebuilds the list.
- Each extra entry is split on `=` and each part is trimmed. A malformed pair such as an empty id is not validated here.
- The backend app is also layered over deployed files by `@infrastructure/i18n`, per the module doc.
