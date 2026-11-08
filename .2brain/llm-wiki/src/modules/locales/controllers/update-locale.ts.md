---
source: src/modules/locales/controllers/update-locale.ts
sha256: 3248d2a224ca7227e7597fb0e6935b6daa870e069e6256b4cf81b67c99dfeeb9
generated_at: 2026-11-08T06:22:40.736903+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/update-locale.ts

## Purpose

Builds the two HTTP handlers for the locale-update endpoints — `PUT /locales/:locale` (full replace) and `PATCH /locales/:locale` (partial merge) — by invoking the shared `createUpdateController` factory with locale-specific schema, lookup, and presentation logic. The language tag is always sourced from the URL path, never the request body, because it is the identity of the dictionary and cannot be renamed in place.

## Key elements

- **`replaceLocale`** — handler for `PUT /locales/:locale`; performs a full replacement of a locale's fields (validated against `ReplaceLocaleBody` extended with `localeDisplayName` on `name`/`nativeName`).
- **`updateLocale`** — handler for `PATCH /locales/:locale`; performs a partial merge (validated against `UpdateLocaleBody`, where `name`/`nativeName` are optional).
- **`createUpdateController({ … })`** — the shared factory call that wires both handlers: sets `versioned: false`, `entity: 'locale'`, and provides the `idFrom`, `update`, and `present` callbacks.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — supplies the `createUpdateController` factory that produces both exported handlers and handles the common request lifecycle (parsing, validation, error mapping).
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, used inside the `update` callback to derive audit/authorization context from the incoming request.
- **`src/modules/locales/services/index.ts`** — source of `localeService`, which contributes the `localeDisplayName` schema fragment, the `updateLanguage` business action, the `describeStoredLanguage` presentation helper, and `standingOn` for caller-scoped output.
- **`src/modules/locales/routes.ts`** — registers `replaceLocale` and `updateLocale` on the router for their respective HTTP methods.

## Notes

- `idFrom` returns `String(request.params.locale)` — a plain string, **not** an ObjectId. No format validation is applied; a malformed tag simply misses every row in `findByTag` and surfaces as a standard 404.
- The tag is intentionally excluded from both request-body schemas. Attempting to rename a tag in the body has no effect by design.
- `versioned: false` is passed to the factory, so these handlers do not participate in the versioning/ETag flow that other controllers may use.
- `name` and `nativeName` are validated with `localeService.localeDisplayName` (a custom Zod schema), giving them stricter shape than the base `ReplaceLocaleBody`/`UpdateLocaleBody` fields.
