---
source: src/modules/locales/controllers/update-locale.ts
sha256: ff8c0f44acfb3a2d6724ed3c1b006328da5a33c46d564839e54f727efac7828b
generated_at: 2026-09-27T14:58:38.394549+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/update-locale.ts

## Purpose

Handler pair for `PUT /locales/:locale` (full replace) and `PATCH /locales/:locale` (partial merge), built via the shared `createUpdateController` factory. The locale tag is always sourced from the path parameter — it is the dictionary's identity and cannot be overridden from the request body.

## Key elements

- **`replaceLocale`** — `PUT` handler; validates the body against `ReplaceLocaleBody` (extended with `name`/`nativeName` via `localeService.localeDisplayName`) and delegates to `localeService.updateLanguage`.
- **`updateLocale`** — `PATCH` handler; same shape but `name`/`nativeName` are optional in the `UpdateLocaleBody` schema.
- **`idFrom`** — extracts `request.params.locale` as a plain string; deliberately skips ObjectId validation because `findByTag` is a string-field match and a malformed tag simply 404s.
- **`present`** — calls `row.toJSON()` to apply the Mongoose `_id → id` transform, then casts to the wire-level `Language` type.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — provides the `createUpdateController` factory that wires up the replace/patch pair, schema validation, and 404 handling around the `update` and `present` callbacks supplied here.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf(request)`, forwarded as the audit-context argument to `localeService.updateLanguage`.
- **`src/modules/locales/services/index.ts`** — source of `localeService`, which exposes `updateLanguage(tag, changes, context)` and the `localeDisplayName` validator used to extend both schemas.
- **`src/types/index.ts`** — provides the `Language` type used as the return annotation of `present`.
- **`src/modules/locales/routes.ts`** — registers `replaceLocale` / `updateLocale` on the `PUT` / `PATCH` locale routes.

## Notes

- The tag is path-only by design; the body schemas never include it. Attempting to change the tag would rename an entire dictionary, so it is intentionally excluded from both `ReplaceLocaleBody` and `UpdateLocaleBody`.
- No explicit format validation is applied to the tag. A non-matching tag results in a standard 404 from `findByTag` rather than a 400, which is the intended behaviour.
- The document returned by `localeService.updateLanguage` is typed as the Mongoose document (with `_id`), not as `Language`; the `present` callback bridges that gap via `toJSON()`.
