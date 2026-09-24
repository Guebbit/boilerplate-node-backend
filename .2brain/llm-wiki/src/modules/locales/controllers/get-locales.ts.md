---
source: src/modules/locales/controllers/get-locales.ts
sha256: 3b611dcb2eb651850640d294644b76dd5490fa59c806ebbcf902c83a10050618
generated_at: 2026-09-23T18:48:58.729083+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locales.ts

## Purpose

Express controllers for the two locale endpoints: a manifest of every language the deployment offers (`GET /locales`) and the API's own filesystem-backed dictionary for a single language (`GET /locales/:locale`). They separate the database-backed "what can we do?" tier from the filesystem "here are our own messages" tier, so a database outage degrades gracefully rather than failing both.

## Key elements

- **`getLocales`** — `GET /locales`. Calls `localeService.listCapabilities` with the caller's scope (derived from `request.authContext` via `localeService.callerScope`), then wraps the result in `successResponse`. Errors are funneled through `catchAs`.
- **`getLocaleDictionary`** — `GET /locales/:locale`. Validates the `locale` param against `listSupportedLocales()`, returns 404 with a `t('generic.error-invalid-data')` message if missing. On success, returns `{ locale, messages: readLocaleDictionary(locale) }`.
- Both functions are plain Express handlers (no class wrapper); they are the registered route handlers for `src/modules/locales/routes.ts`.

## Relationships

- **`src/modules/locales/routes.ts`** — registers `getLocales` and `getLocaleDictionary` as the handlers for their respective routes; also mounts the `getAuth` middleware that populates `request.authContext`.
- **`src/modules/locales/services/index.ts`** — supplies `localeService` (`listCapabilities`, `callerScope`) used by `getLocales`.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` and `rejectResponse` used by both controllers.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, the shared error-catch wrapper for `getLocales`.
- **`src/infrastructure/i18n/index.ts`** — re-exports `listSupportedLocales`, `readLocaleDictionary`, and `t` (the API's own translation function) used by `getLocaleDictionary`.
- **`src/infrastructure/i18n/catalog.ts`** — source of `readLocaleDictionary` / `listSupportedLocales` (filesystem-backed).
- **`src/infrastructure/i18n/context.ts`** — source of the `t` function used for error-message keys.
- **`src/types/index.ts`** — defines `LocaleCapabilities` and `LocaleDictionary` return shapes.

## Notes

- **Two-tier scope model:** `capabilities` entries carry a `scopes` array. `api` means the language is usable via `Accept-Language`; `app` means a dictionary file is downloadable. The two are independent.
- **Graceful degradation:** `getLocales` hits the database. If the DB is down, the caller still receives the static/`api`-scoped languages; only the `app`-scoped entries are lost. `getLocaleDictionary` never touches the database — it reads the filesystem, so it remains available during a DB outage.
- **Path-traversal guard is implicit:** `listSupportedLocales()` is derived from the actual directory listing, so `includes(locale)` simultaneously validates existence and rejects any `../` traversal. There is no separate sanitization step.
- **Keyspace separation:** the ~60 message keys returned here are the API's own operational strings. Client UI copy lives in a separate, database-backed endpoint (`GET /locales/:locale/messages`) and must not be conflated.
