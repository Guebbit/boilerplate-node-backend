---
source: src/modules/locales/controllers/put-locale-entry.ts
sha256: 698e0319b68671ce7b1009231a236be3832fde26acf4fa465161e6dee9caea0d
generated_at: 2026-11-14T20:18:34.531669+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/put-locale-entry.ts

## Purpose

Handles the admin `PUT /locales/:locale/apps/:app/entries/:entryId` endpoint. It validates the entry ID and request body, delegates to the locale service to update a single entry's value, and returns the updated entry in a standard success shape.

## Key elements

- **`replaceLocaleEntry`** (exported) – The sole controller function. Validates `entryId` via `requireId`, parses the body against the `ReplaceLocaleEntryBody` Zod schema, calls `localeService.updateEntry`, and responds with the presented `LocaleEntry` or an error.
- **`requireId`** call – Resolves and validates the `entryId` path parameter; short-circuits with a 404 (`locales.error-entry-not-found`) if the ID is malformed or missing.
- **`parseBody`** call – Validates `request.body` against the Zod schema before it reaches the service layer.
- **`localeService.updateEntry`** – The service call that performs the actual update; receives locale, app, entryId, validated body, and caller context.
- **`presentLocaleEntry`** – Transforms the service result into the wire-format `LocaleEntry` shape before sending the success response.
- **`catchAs`** – Catches any thrown/rejected error and maps it to the appropriate HTTP error response under the `'replaceLocaleEntry'` label.

## Relationships

- **`src/modules/locales/routes.ts`** – Registers `replaceLocaleEntry` as the PUT handler for the entry URI.
- **`src/modules/locales/services/index.ts`** – Exports `localeService`; this controller calls its `updateEntry` method.
- **`src/modules/locales/presenters.ts`** – Exports `presentLocaleEntry`, used to shape the response payload.
- **`src/infrastructure/http/controller.ts`** – Provides the shared helpers `catchAs`, `parseBody`, and `refused`.
- **`src/infrastructure/http/ids.ts`** – Provides `requireId` for path-parameter ID validation.
- **`src/infrastructure/http/request.ts`** – Provides `callerContextOf` to extract the authenticated caller's context for the service call.
- **`src/infrastructure/http/response.ts`** – Provides `successResponse` for the 200 reply.
- **`src/types/index.ts`** – Supplies the `LocaleEntry` and `ReplaceLocaleEntryRequest` type contracts.

## Notes

- The `entryId` (key) is **not** editable via this endpoint; it is the lookup identity. Changing a key is a delete + create, not a PUT.
- No `If-Match` / ETag concurrency guard is applied — the value is a single string edited from a list, so optimistic locking is intentionally omitted.
- The `app` is a path segment, so this PUT targets exactly the same scope as the corresponding GET.
