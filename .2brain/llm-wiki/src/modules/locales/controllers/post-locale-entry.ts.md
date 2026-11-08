---
source: src/modules/locales/controllers/post-locale-entry.ts
sha256: 49f3859d02f807103b5580a4939e453514c0e663af435fc1ad8609d2ad39ff3c
generated_at: 2026-11-08T06:21:48.677858+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/post-locale-entry.ts

## Purpose
Controller handler for `POST /locales/:locale/apps/:app/entries`. Validates the request body, delegates to the locale service to add a single key to an app's dictionary, and responds with `201 Created` including a `Location` header pointing to the new entry.

## Key elements
- **`createTrimmedEntryBody`** — A local Zod schema extending `CreateLocaleEntryBody` with the `key` field wrapped in `trimmedInto`, ensuring whitespace-only keys fail as a field-level 422 rather than a generic validation error.
- **`createLocaleEntry`** *(exported)* — The Express handler. Pipeline: `parseBody` → `localeService.createEntry` → `refused` check → `presentLocaleEntry` → `createdResponse` (with `Location` header). Errors are funneled through `catchAs(response, 'createLocaleEntry')`.

## Relationships
- **`@infrastructure/http/controller`** — Supplies `parseBody`, `refused`, and `catchAs`, the project's standard controller utilities for validation, rejection short-circuiting, and error serialization.
- **`@infrastructure/http/request`** — Supplies `callerContextOf`, used to forward authenticated caller context into the service call.
- **`@infrastructure/http/response`** — Supplies `createdResponse`, which writes the `201` status, body, and `Location` header.
- **`@infrastructure/http/schemas`** — Supplies `trimmedInto`, the Zod string transform used to trim the `key` field.
- **`../services/index`** — Calls `localeService.createEntry(locale, app, body, callerContext)`, the business-logic entry point.
- **`../presenters`** — Calls `presentLocaleEntry` to shape the service result into the API response model.
- **`@types`** — Imports `CreateLocaleEntryRequest` and `LocaleEntry` as the request/response type contracts.
- **`../routes`** — Wires this handler to the actual route path (graph neighbor; not imported here).

## Notes
- The `key` trim is applied at the *schema* layer (not in the service) so that a blank/whitespace key is rejected before any service call is made, producing a precise field-level 422 message.
- The `Location` header is built from the *presented* entry's `id`, not from the raw service result, ensuring the URL reflects the final resource path.
- Follows the project's uniform controller pattern: no `try/catch` blocks in the handler; all error handling is delegated to `catchAs`.
