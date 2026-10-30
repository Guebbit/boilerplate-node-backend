---
source: src/modules/example/controllers/update-example.ts
sha256: a6475ae19ced5785c9abdc50d7122f40f52f0c37b78c4a55ebddabd41bbabb3d
generated_at: 2026-10-29T03:52:13.204556+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/update-example.ts

## Purpose

Wires up the `PUT /examples/:id` (replace) and `PATCH /examples/:id` (merge) endpoints for the example module. All shared mechanics—id lookup, `If-Match` / `ETag` handling, and the request pipeline—live in the `createUpdateController` factory; this file only supplies the two trimmed body schemas and the service call.

## Key elements

- **`replaceTrimmedBody`** (local const) — `ReplaceExampleByIdBody` extended so `title` and `body` are whitespace-trimmed at the field level (blank-after-trim → 422, not a blank DB value).
- **`updateTrimmedBody`** (local const) — Same trimming applied to `UpdateExampleByIdBody`, with `title`/`body` kept `.optional()` so a missing field in a PATCH body stays absent.
- **`replaceExample`** (exported) — The `PUT` handler; registered in routes.
- **`updateExample`** (exported) — The `PATCH` handler; registered in routes.
- Both are created in one `createUpdateController` call configured with `versioned: true`, `entity: 'example'`, `notFoundKey: 'example.not-found'`, and a pass-through `present` (the service already returns the contract shape).

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** — Provides the shared update pipeline; this file is a thin configuration over it.
- **`src/infrastructure/http/schemas.ts`** — Supplies `trimmedInto`, used to wrap the `title`/`body` Zod schemas with trim validation.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, called inside the `update` callback to pass caller identity to the service.
- **`src/modules/example/services/index.ts`** — Provides `exampleService.updateById`, the single business-logic call both handlers delegate to.
- **`src/modules/example/routes.ts`** — Consumes the `replaceExample` / `updateExample` exports to attach them to the HTTP router.

## Notes

- `present` is intentionally a no-op (`example => example`); if the service's return shape ever diverges from the API contract, this is where mapping would be added.
- PATCH optional fields are unwrapped before trimming (`.unwrap()`) and then re-wrapped with `.optional()`, so a completely omitted field is not coerced to `""`.
- `versioned: true` opts into `If-Match` / `ETag` enforcement; the factory handles the 412 / 428 responses.
- The module doc comment points to `docs/api/write-methods.md` for the broader PUT-vs-PATCH contract.
