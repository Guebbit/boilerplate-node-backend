---
source: src/modules/locales/apps.ts
sha256: 87e769eb54f554dbb4e2c2f069f08f63a41a64fc6342ad137f583befc5a825f7
generated_at: 2026-10-15T10:41:28.973896+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/apps.ts

## Purpose

Defines the fixed set of translation keyspaces ("apps") for a deployment. An app is one consumer of the translation service, identified by the `(language, app, key)` triple. The id set is deliberately configuration-driven (env vars) rather than database rows so that an import typo cannot silently create a keyspace nobody serves. Exactly one app is the `backend` (the API's own copy); every other is a `frontend`.

## Key elements

- **`backendApp()`** — Returns the API's own app id (`NODE_LOCALE_APP_BACKEND`, default `demo-be`).
- **`frontendApp()`** — Returns the default frontend app id (`NODE_LOCALE_APP_FRONTEND`, default `demo-fe`); used when a client omits an explicit app.
- **`extraFrontendApps()`** (module-private) — Parses `NODE_LOCALE_APPS_EXTRA` (comma-separated `id=Label` pairs) into `LocaleAppDescriptor[]`. Missing label falls back to the id.
- **`listApps()`** — Returns every app as `LocaleAppDescriptor[]` in a fixed order: backend → default frontend → extras. Deduplicates by id (first spelling wins).
- **`frontendAppIds()`** — Subset of `listApps` containing only frontend-kind ids; the ids `entryCount` and the messages route may serve.
- **`isKnownApp(id)`** — Membership test: does this deployment recognise the id?
- **`isFrontendApp(id)`** — Stricter test: is the id specifically a frontend app whose dictionary may be served?

## Relationships

- **`src/modules/locales/config.ts`** — Reads all three env-var settings (`NODE_LOCALE_APP_BACKEND`, `NODE_LOCALE_APP_FRONTEND`, `NODE_LOCALE_APPS_EXTRA`) via `localesConfig()`.
- **`src/types/index.ts`** — Source of `LocaleApp`, `LocaleAppDescriptor`, and `LocaleAppKind` types.
- **`src/modules/locales/repository.ts`** — Consumes `isKnownApp` / `isFrontendApp` for input validation before persisting or querying entries.
- **`src/modules/locales/services/languages.ts`** — Calls `listApps()` to power `GET /locales/apps`.
- **`src/modules/locales/services/messages.ts`** — Uses `frontendAppIds()` / `isFrontendApp()` to gate which apps' message dictionaries are served.
- **`src/modules/locales/services/index.ts`** — Re-exports the public API of this module.
- **`src/modules/locales/tests/unit/apps.test.ts` / `apps.fixture.ts`** — Unit-test the parsing, ordering, dedup, and predicate behaviour.
- **`scenarios/locales.ts`** — Integration scenarios exercise the app list end-to-end.

## Notes

- `backendApp()` and `frontendApp()` return a bare `LocaleApp` (string id), while `listApps()` returns `LocaleAppDescriptor` objects. Callers that need only the id must pick the appropriate helper.
- `extraFrontendApps()` splits on `=`; a pair without `=` yields `undefined` for the label, which is then replaced by the id itself. There is no validation for more than two `=` characters in a pair.
- Deduplication in `listApps` is order-sensitive: if the same id appears in both `NODE_LOCALE_APP_FRONTEND` and `NODE_LOCALE_APPS_EXTRA`, the default-frontend entry (second position) wins and the extra is dropped.
- The module is stateless and pure (beyond the config read); it is safe to call from any layer at any time.
