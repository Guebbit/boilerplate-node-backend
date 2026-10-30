---
source: src/modules/example/controllers/post-example.ts
sha256: 95daab4309f9a27484eb6099d5c2de8249b20be9ebf5925aabcd49af681a9cc5
generated_at: 2026-10-29T03:51:51.044531+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/post-example.ts

## Purpose

Handles `POST /examples` by validating the request body against a generated Zod schema (with whitespace trimming), delegating to the example service, and responding with `201` + a `Location` header. It is the HTTP entry point for the "create example" operation.

## Key elements

- **`createTrimmedBody`** – Local schema constant. Extends `CreateExampleBody` (from `@api/schemas.zod`) so that `title` and `body` are trimmed before validation. This means a whitespace-only string becomes a field-level 422 rather than passing through as an empty string.
- **`postExample`** – The exported named handler. Parses the body with `createTrimmedBody`, calls `exampleService.create(body, callerContextOf(request))`, then either:
  - responds with `201` + `Location: /examples/<id>` via `createdResponse`, or
  - short-circuits on a `refused` result, or
  - surfaces an error through `catchAs(response, 'postExample')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies the handler plumbing: `namedHandler` (names the handler for observability), `parseBody` (schema validation + response on failure), `refused` (service-level rejection check), `catchAs` (async error formatting).
- **`src/infrastructure/http/request.ts`** – Supplies `readInput` (extracts the raw body for a given surface) and `callerContextOf` (derives caller identity for the service call).
- **`src/infrastructure/http/response.ts`** – Supplies `createdResponse`, which writes the `201` status, JSON body, and `Location` header.
- **`src/infrastructure/http/schemas.ts`** – Supplies `trimmedInto`, a schema helper that wraps an existing Zod string field with a `.transform` that trims whitespace before validation.
- **`src/modules/example/routes.ts`** – Registers `postExample` on the `POST /examples` route.
- **`src/modules/example/services/index.ts`** – Exports `exampleService`, whose `.create()` method performs the actual persistence and returns a `{ data, refused? }` result.

## Notes

- The trimming is applied *before* Zod's own validation runs (via `.extend` + `.transform`), so `"   "` fails as an empty string rather than passing as a valid 3-char string. This is an intentional UX choice documented in the inline comment.
- `parseBody` returns `undefined` on validation failure and has already written the error response; the handler must `return` early in that case (it does).
- The `catchAs` call tags the error context with the handler name `'postExample'` for log correlation.
- The `readInput` call passes `{ surface: 'create' }`, which likely selects a specific input extraction strategy for create-vs-update semantics.
