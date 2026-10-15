---
source: src/modules/locales/controllers/update-locale.ts
sha256: 12c94b1c050cbe14dd2bea2c8004c2c427d23170f199fc1361c38680f7584981
generated_at: 2026-10-15T10:42:39.792325+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/update-locale.ts

## Purpose

Builds the `PUT /locales/:locale` (full replace) and `PATCH /locales/:locale` (partial merge) handlers on the shared `createUpdateController` factory. The language tag comes from the URL path and is never editable from the request body, because renaming a tag would rename an entire dictionary.

## Key elements

- **`replaceLocale`** – `PUT` handler; full-replace of a locale row.
- **`updateLocale`** – `PATCH` handler; partial merge of a locale row.
- Both are produced by a single `createUpdateController({...})` call with:
  - `versioned: false` – no ETag/version-checking.
  - `replaceSchema` / `patchSchema` – Zod schemas that extend the base body schemas, overriding `name` and `nativeName` with `localeService.localeDisplayName` validation.
  - `idFrom` – extracts `request.params.locale` as a plain string (bypasses the factory's default `:id` ObjectId validation).
  - `update` – delegates to `localeService.updateLanguage(tag, changes, callerContextOf(request))`.
  - `present` – maps the service row through `presentLocale`.

## Relationships

- **`create-update-controller.ts`** – provides the `createUpdateController` factory that wires schema validation, id extraction, the update callback, and response presentation into a pair of HTTP handlers.
- **`request.ts`** – supplies `callerContextOf`, which derives the authenticated caller identity passed into the service call for auditing.
- **`services/index.ts`** – exposes `localeService`, whose `updateLanguage` performs the actual write and `localeDisplayName` supplies the field-level validation schema.
- **`presenters.ts`** – exports `presentLocale`, which transforms the service-layer row into the wire response shape.
- **`routes.ts`** – imports `replaceLocale` / `updateLocale` and mounts them on the `PUT` and `PATCH /locales/:locale` route.

## Notes

- The path param is `:locale` (a BCP-47 language tag), **not** an ObjectId. No format check is performed; a malformed tag simply fails the `findByTag` lookup and returns the standard 404.
- `name` and `nativeName` are validated against `localeService.localeDisplayName`, which may impose locale-specific constraints beyond a plain string.
- Because `versioned` is `false`, there is no optimistic-concurrency (If-Match / ETag) protection on these mutations.
