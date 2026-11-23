---
source: src/modules/locales/controllers/update-locale.ts
source_sha256: 230e5892c69c40df93e51b37104eba4977a4e27c9cd7ed9c422b3f234bfb4d47
context_sha256: 534189175f2e6dc39eab89b03c5f52f84c993f8e31af1ef23445e596f38b2a3f
generated_at: 2026-11-22T05:44:27.080312+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/update-locale.ts

## Purpose
Defines the HTTP controllers for `PUT /locales/:locale` (full replace) and `PATCH /locales/:locale` (partial merge). Both are produced by the shared `createUpdateController` factory. The locale tag identifies the dictionary that every entry references, so it is read only from the URL path and never from the request body.

## Key elements
- **`replaceLocale`**: handler for `PUT`, destructured from the factory's `replace`.
- **`updateLocale`**: handler for `PATCH`, destructured from the factory's `update`.
- **Factory config**:
  - `versioned: true` and `entity: 'locale'`.
  - `replaceSchema`: `ReplaceLocaleBody` (from `@api/schemas.zod`) with `name` and `nativeName` overridden by `localeService.localeDisplayName`.
  - `patchSchema`: `UpdateLocaleBody` (from `@api/schemas.zod`) with the same two fields overridden by `localeDisplayName.optional()`.
  - `idFrom`: reads `request.params.locale` and normalizes it with `localeService.normalizeTag`.
  - `update`: calls `localeService.updateLanguage(tag, changes, callerContextOf(request))`.
  - `present`: formats the stored row with `localeService.describeStoredLanguage(row, localeService.standingOn(request.caller))`.

## Relationships
- **`src/infrastructure/surfaces/create-update-controller.ts`**: supplies the factory that builds both handlers. This file only supplies the config.
- **`src/infrastructure/http/request.ts`**: provides `callerContextOf`, which turns the request into the caller context passed to `updateLanguage`.
- **`src/modules/locales/services/index.ts`**: provides `localeService`. This file uses its display-name validators, `normalizeTag`, `updateLanguage`, `describeStoredLanguage` and `standingOn`.
- **`src/modules/locales/routes.ts`**: the route definitions are the consumer of `replaceLocale` and `updateLocale`. This file does not reference the routes itself.

## Notes
- The path param is `:locale`, not the `:id` the factory would normally validate, so `idFrom` is overridden.
- There is no tag format check on purpose. `findByTag` matches a plain string field, so a malformed tag matches no language and ends in the normal 404.
- Normalization keeps `If-Match` versioning keyed the way the repository's `save` keys it (for example `pt-br` becomes `pt-BR`).
- `updateLanguage` audits the change itself, so the controller does no auditing.
