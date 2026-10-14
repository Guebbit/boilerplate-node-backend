---
source: src/modules/example/controllers/update-example.ts
sha256: 88fc8431727dd883dd672adf8054e4989b4bd8c4865dfe5157854c5d2fd6f4d5
generated_at: 2026-10-14T15:41:31.297325+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/update-example.ts

## Purpose

Defines the two HTTP handlers for `PUT /examples/:id` (full replace) and `PATCH /examples/:id` (partial merge) by calling the shared `createUpdateController` factory. The file's only job is to supply the module-specific pieces — the two Zod schemas, the entity metadata, and the service delegation — while the factory owns the common pipeline (id resolution, `If-Match`/`ETag`, 404 handling).

## Key elements

- **`replaceExample`** — The `PUT` handler. Validates the body against `ReplaceExampleByIdBody`, then delegates to `exampleService.update` with a full-replacement change set.
- **`updateExample`** — The `PATCH` handler. Validates the body against `UpdateExampleByIdBody`, then delegates to `exampleService.update` with a partial change set.
- **`createUpdateController({ … })` call** — Configures the shared factory with `versioned: true`, entity name, 404 key, both schemas, the `update` callback, and an identity `present` mapper. Destructures the resulting `{ replace, update }` pair into the two named exports.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — Provides the `createUpdateController` factory that assembles the entire PUT/PATCH pipeline (id check, ETag/If-Match logic, status codes) and returns the two handler functions.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, used inside the `update` callback to extract and forward the caller's context to the service layer.
- **`src/modules/example/services/index.ts`** — Exports `exampleService`; its `update(id, changes, context)` method performs the actual persistence logic that both handlers invoke.
- **`src/modules/example/routes.ts`** — The route table that imports `replaceExample` and `updateExample` to register them on the `PUT` and `PATCH` endpoints respectively.

## Notes

- The `present` mapper is an identity function (`(example) => example`) because the service already returns responses in the API contract shape. Do not add transformation here.
- Both methods share a single pipeline; the only per-method difference is which Zod schema validates the body. Any change to ETag or 404 behavior belongs in `create-update-controller.ts`, not here.
- The module doc-comment points to `docs/api/write-methods.md` for the broader PUT-vs-PATCH semantics.
