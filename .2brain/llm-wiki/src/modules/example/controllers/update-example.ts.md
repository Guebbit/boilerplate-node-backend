---
source: src/modules/example/controllers/update-example.ts
sha256: a6475ae19ced5785c9abdc50d7122f40f52f0c37b78c4a55ebddabd41bbabb3d
generated_at: 2026-11-08T05:49:27.455096+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/update-example.ts

## Purpose

Defines the `PUT` (replace) and `PATCH` (merge) handlers for `/examples/:id`. Both verbs share a single pipeline produced by the shared `createUpdateController` factory, which owns the id-existence check, `If-Match`/`ETag` enforcement, and response shaping. This file only supplies the two trimmed request schemas and the service call.

## Key elements

- **`replaceTrimmedBody`** – Extends `ReplaceExampleByIdBody` so `title` and `body` are run through `trimmedInto` before validation. A whitespace-only string yields a field-level 422 instead of being stored as a blank column.
- **`updateTrimmedBody`** – Same trimming applied to the optional `title`/`body` fields of `UpdateExampleByIdBody`; omitted fields stay omitted.
- **`replaceExample` / `updateExample`** (exports) – Destructured from `createUpdateController(...)`. `replaceExample` handles `PUT`, `updateExample` handles `PATCH`. Both ultimately call `exampleService.updateById(id, changes, callerContextOf(request))`.
- **`present`** – Identity pass-through; the service is expected to already return the contract's shape, so no mapping is needed.

## Relationships

- **`src/infrastructure/surfaces/create-update-controller.ts`** – Provides the `createUpdateController` factory that assembles the id-check → schema-validate → `If-Match`/`ETag` → service-call → present pipeline and returns the `{ replace, update }` handler pair.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf`, extracted from the incoming request and forwarded as the third argument to the service.
- **`src/infrastructure/http/schemas.ts`** – Supplies `trimmedInto`, the helper that wraps a Zod string schema so whitespace-only values fail at the field level.
- **`src/modules/example/services/index.ts`** – Exports `exampleService`; its `updateById` method performs the actual persistence.
- **`src/modules/example/routes.ts`** – Registers `replaceExample` and `updateExample` on the Express (or equivalent) router for the `PUT` and `PATCH` verbs respectively.

## Notes

- `versioned: true` means the factory enforces `ETag` / `If-Match` on both verbs; the controller itself contains no ETag logic.
- The `notFoundKey` (`'example.not-found'`) is an i18n key, not a literal message—localisation is resolved elsewhere.
- PATCH schema construction uses `.unwrap()` before trimming and re-applies `.optional()` afterwards; this is the correct pattern for trimming an optional field without accidentally making it required.
- Refer to `docs/api/write-methods.md` (linked in the module doc-block) for the broader PUT-vs-PATCH contract.
