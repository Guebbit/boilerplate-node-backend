---
source: src/modules/example/controllers/delete-example.ts
sha256: f4f3be703190da5c0b36788f48e5fb12737b130678fef592982ebac9182fd7db
generated_at: 2026-11-08T05:48:22.947158+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/delete-example.ts

## Purpose

Hand-written controller for `DELETE /examples/:id`. It exists in place of the shared delete factory because that factory emits a soft/hard delete triplet, while the example module has no soft-delete tier to flag.

## Key elements

- **`deleteExample`** (exported) — Validates the route param via `requireId`, then calls `exampleService.removeById(id, callerContext)`. On success sends **204 No Content**; on refusal (permission or not-found) delegates to `refused`; unexpected errors are funneled through `catchAs`.

## Relationships

- **`@infrastructure/http/ids`** — `requireId` extracts and validates the `:id` param, sending a 404 itself on failure.
- **`@infrastructure/http/request`** — `callerContextOf(request)` builds the caller identity passed to the service.
- **`@infrastructure/http/response`** — `noContentResponse` produces the 204 body.
- **`@infrastructure/http/controller`** — `refused` maps a service-level denial to the appropriate 4xx response; `catchAs` converts thrown errors into a JSON error response.
- **`../services/index`** — `exampleService.removeById` performs the actual persistence deletion.
- **`../routes`** — Registers `deleteExample` as the handler for the `DELETE /examples/:id` route.

## Notes

- **404 for all failure modes.** A malformed id, an unknown id, *and* a caller lacking delete permission all return **404** (not 403), so the response does not leak whether the resource exists to an unauthorised caller.
- **Early-return pattern.** When `requireId` fails it has already written the error response; the controller then returns `Promise.resolve()` to short-circuit without touching the service.
- **No soft-delete path.** The service method called is `removeById` (hard delete). If a soft-delete tier is ever added, this controller should be replaced by the shared factory.
