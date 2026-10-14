---
source: src/modules/example/controllers/post-example.ts
sha256: b03cc00fb79e25b850b7a825e09ed789fe621fd307b69e303f7d02baf938fdae
generated_at: 2026-10-14T15:41:01.067757+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/post-example.ts

## Purpose

Controller handler for `POST /examples`. Validates the request body against the generated Zod schema, delegates to `exampleService.create`, and returns `201 Created` with a `Location` header on success.

## Key elements

- **`postExample`** (exported) — The HTTP handler, wrapped in `namedHandler('postExample', …)`. Steps in order:
  1. Reads raw input via `readInput(request, { surface: 'create' })`.
  2. Parses it against `CreateExampleBody`; bails early if parsing fails (response already sent by the helper).
  3. Calls `exampleService.create(body, callerContextOf(request))`.
  4. On a `refused` result, short-circuits (helper sends the appropriate status).
  5. On success, calls `createdResponse` with the new entity, its `Location` (`/examples/{id}`), and an optional message.
  6. Catches any thrown error via `catchAs(response, 'postExample')`.

## Relationships

- **`@infrastructure/http/controller`** — supplies `namedHandler`, `parseBody`, `refused`, and `catchAs` (the four structural helpers that shape every controller in this codebase).
- **`@infrastructure/http/request`** — supplies `readInput` (extracts the raw payload) and `callerContextOf` (derives auth/tenant context for the service call).
- **`@infrastructure/http/response`** — supplies `createdResponse` (serialises the 201 body + `Location` header).
- **`../services`** (`src/modules/example/services/index.ts`) — provides `exampleService`, whose `.create` performs the actual domain logic.
- **`src/modules/example/routes.ts`** — registers `postExample` on the `POST /examples` route.

## Notes

- `parseBody` returns `undefined` **and** has already written the error response when validation fails; the handler must `return Promise.resolve()` to avoid falling through to the service call. This is the standard guard pattern across all create controllers.
- The `surface: 'create'` argument to `readInput` is a hint for logging/middleware that this payload is expected for a creation action — it does not alter parsing behaviour.
- The caller context is extracted from the request envelope (not the body) and passed as the second argument to `exampleService.create`, so the body schema does not include identity fields.
