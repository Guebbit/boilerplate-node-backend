---
source: src/modules/locales/controllers/update-locale.ts
sha256: 3248d2a224ca7227e7597fb0e6935b6daa870e069e6256b4cf81b67c99dfeeb9
generated_at: 2026-10-29T04:20:29.478974+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/update-locale.ts

## Purpose

Builds the `PUT /locales/:locale` (replace) and `PATCH /locales/:locale` (merge) handlers by calling the shared `createUpdateController` factory. The locale tag is treated as an immutable identity key — it comes from the URL path and is never accepted from the request body.

## Key elements

- **`replaceLocale`** — exported handler for `PUT /locales/:locale`. Full replacement of a locale's fields (minus the tag).
- **`updateLocale`** — exported handler for `PATCH /locales/:locale`. Partial merge; fields omitted from the body are left unchanged.
- **`replaceSchema`** — `ReplaceLocaleBody` extended with required `name` and `nativeName` (validated via `localeService.localeDisplayName`).
- **`patchSchema`** — `UpdateLocaleBody` extended with optional `name` and `nativeName`.
- **`idFrom`** — extracts the tag via `String(request.params.locale)`. No ObjectId or format validation; a malformed tag simply fails the string lookup and yields a 404.
- **`update`** — delegates to `localeService.updateLanguage(tag, changes, callerContextOf(request))`.
- **`present`** — serializes the stored row through `localeService.describeStoredLanguage(row, localeService.standingOn(request.caller))`.

## Relationships

- **`@infrastructure/surfaces/create-update-controller`** — provides the `createUpdateController` factory; this file supplies its configuration object (`versioned`, `entity`, schemas, `idFrom`, `update`, `present`) and receives the `{ replace, update }` handler pair.
- **`@infrastructure/http/request`** — `callerContextOf(request)` is passed into `localeService.updateLanguage` to attach caller/audit context.
- **`../services` (locales service)** — `localeService` provides `updateLanguage`, `describeStoredLanguage`, `localeDisplayName` (schema validator), and `standingOn`.
- **`../routes`** — registers `replaceLocale` / `updateLocale` on the HTTP router (imported by the routes file, not by this file).

## Notes

- The locale tag is intentionally **not editable** through either endpoint; it is identity, not data. Changing it would rename the dictionary key that every entry references.
- No format/regex check is applied to the path param on purpose: `findByTag` does a plain string match, so an invalid tag misses all documents and falls through as a standard 404 rather than a 400.
- `versioned: false` — locale entities do not participate in the versioning scheme used by other resources.
