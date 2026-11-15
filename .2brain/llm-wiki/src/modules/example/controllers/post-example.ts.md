---
source: src/modules/example/controllers/post-example.ts
sha256: 1d42420de253ed54a059b5ed21096b941fafbfbb6b01f3909fbdd3969c1a7246
generated_at: 2026-11-14T19:57:22.758892+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/post-example.ts

## Purpose
HTTP handler for `POST /examples`. Validates the JSON body against the generated Zod schema (with whitespace trimming applied), delegates to `exampleService.create`, and answers `201 Created` with a `Location` header pointing to the new resource.

## Key elements
- **`createTrimmedBody`** – Local schema: `CreateExampleBody` extended so `title` and `body` are whitespace-trimmed before validation. Ensures `"   "` fails as an empty-field 422 rather than passing as a valid (but meaningless) string.
- **`postExample`** *(exported)* – The Express handler, wrapped in `namedHandler('postExample', …)`. Parses the body, calls the service, and on success sets resource identity headers (`answerAsResource`) before sending the `201` + `Location` body (`createdResponse`). Errors are funnelled through `catchAs(response, 'postExample')`.

## Relationships
- **`src/infrastructure/http/controller.ts`** – Supplies the handler plumbing: `namedHandler`, `parseBody`, `refused`, `catchAs`.
- **`src/infrastructure/http/request.ts`** – `readInput` extracts the raw body (tagged `surface: 'create'`); `callerContextOf` derives the authenticated caller for the service call.
- **`src/infrastructure/http/response.ts`** – `createdResponse` sends the final `201` with body and `Location`.
- **`src/infrastructure/http/preconditions.ts`** – `answerAsResource` emits resource-identity headers (ETag, Last-Modified) on the response.
- **`src/infrastructure/http/schemas.ts`** – `trimmedInto` wraps an existing Zod string schema to apply `.trim()`.
- **`src/modules/example/services/index.ts`** – Exports the `exampleService` instance whose `create` method performs the actual persistence / business logic for the new example.
- **`src/modules/example/routes.ts`** – Imports `postExample` and mounts it on the `POST /examples` route.

## Notes
- Whitespace-only strings are deliberately rejected at the *field* level (422) via the `trimmedInto` transform, giving a clearer error message than a "required" failure on a string that is technically present.
- `answerAsResource` is called **before** `createdResponse`; the order matters because the preconditions helper must set headers while the response is still open.
- The handler uses a promise chain (`.then` / `.catch`) rather than `async/await`; `catchAs` is the unified error boundary for this handler.
- `parseBody` returning `undefined` signals validation failure has already been handled (a 422 was sent); the handler short-circuits without touching the service.
