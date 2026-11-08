---
source: src/modules/example/controllers/post-example.ts
sha256: 95daab4309f9a27484eb6099d5c2de8249b20be9ebf5925aabcd49af681a9cc5
generated_at: 2026-11-08T05:49:04.357563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/post-example.ts

## Purpose

Create controller for `POST /examples`. Validates the JSON body against a trimmed Zod schema, delegates to `exampleService.create`, and responds with `201` + `Location` header. Exists to keep the HTTP layer (parsing, status codes, headers) separate from domain logic.

## Key elements

- **`createTrimmedBody`** — Extends the generated `CreateExampleBody` schema so `title` and `body` are trimmed before validation. Ensures whitespace-only strings (e.g. `"   "`) produce a field-level 422 rather than passing as non-empty.
- **`postExample`** *(exported)* — The route handler. Wrapped in `namedHandler('postExample', …)` for observability. Flow: `parseBody` → early-return on invalid input → `exampleService.create(body, callerContext)` → `refused` check → `createdResponse` or `catchAs` error.

## Relationships

- **`@infrastructure/http/controller`** — Supplies `namedHandler`, `parseBody`, `refused`, `catchAs`; the structural backbone of every handler.
- **`@infrastructure/http/request`** — `readInput` extracts the raw body for validation; `callerContextOf` pulls authenticated caller identity for the service call.
- **`@infrastructure/http/response`** — `createdResponse` writes the `201` status, body, and `Location` header.
- **`@infrastructure/http/schemas`** — `trimmedInto` wraps an existing schema field to add `.trim()` before the original check.
- **`src/modules/example/services/index.ts`** — `exampleService.create` performs the actual persistence; this controller is its sole HTTP caller.
- **`src/modules/example/routes.ts`** — Registers `postExample` on the `POST /examples` path (import consumer).

## Notes

- `parseBody` returns `undefined` **after** it has already sent the 422 response; the handler must short-circuit (`if (body === undefined) return`) to avoid a second write to the response.
- The schema is extended at module scope (not inside the handler) so the trimmed variant is created once, not per request.
- Error path uses `catchAs(response, 'postExample')` — the string is the handler name forwarded to the central error formatter for logging/correlation.
