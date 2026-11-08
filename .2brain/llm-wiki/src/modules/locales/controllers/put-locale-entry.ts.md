---
source: src/modules/locales/controllers/put-locale-entry.ts
sha256: 1e9b73855cb0bb1afdd850e07527d4a1ea87157b31c2de805b9387ce4816f17f
generated_at: 2026-11-08T06:22:08.932119+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/put-locale-entry.ts

## Purpose

Express controller handler for `PUT /locales/:locale/apps/:app/entries/:entryId`. It validates the path parameter and request body, delegates to the locale service to update a single entry's value, and returns the updated entry as the HTTP response.

## Key elements

- **`replaceLocaleEntry`** (exported) — The sole handler. Accepts a typed `Request`/`Response` pair, validates `entryId` via `requireId`, parses the body against the `ReplaceLocaleEntryBody` Zod schema, calls `localeService.updateEntry(locale, app, entryId, body, callerContext)`, and either returns a `successResponse` with `presentLocaleEntry` or propagates a refusal/error through `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — Imports the `catchAs`, `parseBody`, and `refused` helpers that handle body validation, error forwarding, and rejection responses.
- **`@infrastructure/http/ids`** — Imports `requireId` to validate the `entryId` path segment (404 if missing).
- **`@infrastructure/http/request`** — Imports `callerContextOf` to extract the authenticated caller's context for the service call.
- **`@infrastructure/http/response`** — Imports `successResponse` to build the 200 JSON envelope.
- **`../services`** — Imports `localeService` and calls its `updateEntry` method.
- **`../presenters`** — Imports `presentLocaleEntry` to transform the service's `LocaleEntry` into the wire format.
- **`@types`** — Imports the `LocaleEntry` and `ReplaceLocaleEntryRequest` type definitions.
- **`../routes`** — The route file that registers this handler on the PUT path (referenced in the module doc-block).

## Notes

- **The entry key is immutable by design.** The key is the lookup identity; changing it is a delete + create, not an update. The body schema (`ReplaceLocaleEntryBody`) therefore carries only the value.
- **Admin endpoint.** The module doc marks this as admin-scoped; caller context is passed through to the service for authorization checks.
- **PUT semantics tied to path.** Because `app` is a path segment, a PUT here replaces exactly the value listed by a GET on the same URI — it is not a partial/merge update.
