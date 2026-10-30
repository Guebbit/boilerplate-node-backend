---
source: src/infrastructure/surfaces/create-update-controller.ts
sha256: cd56dd658d415e7c207139ddc959175752b2efbecbc51504a7d46bac04dca5d3
generated_at: 2026-10-29T02:17:48.084507+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-update-controller.ts

## Purpose

Shared factory that builds a module's PUT (replace) and PATCH (merge) Express handlers from a single pipeline. The verb only changes which schema validates the body, which omitted fields are filled with `null`, and whether a `completeReplace` step runs—everything else (id resolution, `If-Match` fencing, ETag emission, error mapping) is identical. Exists so that every resource's update route follows the same request-flow contract without per-module boilerplate.

## Key elements

- **`UpdateIdSource`** – Discriminated type for how the row id is obtained: a path param (`:id` or a named param like `:addressId`) or a closure (`idFrom`) for routes whose id is not a path segment (e.g., the caller's own record, a language tag).
- **`PatchControllerSpec<TPatch, TRow>`** – Per-entity configuration shared by both verbs: `entity`, `versioned` (enables `If-Match`/412), `patchSchema`, optional `input` (multipart), the `update` service call, and `present` (row → contract shape).
- **`UpdateControllerSpec<TReplace, TPatch, TRow>`** – Extends the patch spec with `replaceSchema`, optional `completeReplace` (nulls keyed-map keys absent from the PUT body), and optional `keptWhenOmitted` (fields excluded from null-filling, e.g. an uploaded image).
- **`clearableFields(schema)`** – Inspects a Zod object's shape and returns the names of fields whose schema accepts `null`; used to derive which omitted PUT fields should be filled with `null`.
- **`createPatchController(spec)`** – Returns a single named PATCH handler (no PUT offered). Used by resources where the body cannot represent the whole record.
- **`createUpdateController(spec)`** – Returns `{ replace, update }`: two named handlers over the shared `pipelineOf` builder. Derives `replaceFills` once (nullable fields minus `keptWhenOmitted`).
- **`pipelineOf(spec)`** (internal) – The single Express handler factory. Steps: resolve id → `readInput` + `parseBody` → `fillOmittedWithNull` → optional `completeReplace` → `update` (wrapped in `withIfMatch` when versioned) → `refused` check → `setEtag` → `present` → `successResponse`. Catches into `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** – Provides the handler primitives: `namedHandler`, `operationName`, `parseBody`, `refused`, `catchAs`, and the `ServiceResult` type that `update` returns.
- **`@infrastructure/http/ids`** – `requireId` validates the path-param id and sends the `notFoundKey` envelope on failure.
- **`@infrastructure/http/preconditions`** – `withIfMatch` gates the write on the request's `If-Match` header; `setEtag` stamps the response with the new row's tag.
- **`@infrastructure/http/request`** – `readInput` decodes the body (form/multipart/JSON) per the `input` declaration; the controller passes `surface: 'create'` to avoid merging a path id into the strict body schema.
- **`@infrastructure/http/response`** – `successResponse` emits the final 200 envelope.
- **`@infrastructure/object-guards`** – `fillOmittedWithNull` inserts `null` for the fields in the `fills` list that are absent from the parsed body.
- **Module controllers** (`update-account`, `update-address`, `update-example`, `update-locale`, `update-order`, `update-product`, `update-user`, `update-subscription`) – Each calls `createUpdateController` (or `createPatchController` for the locale case) with its own schemas, `update` service call, and `present` projection.
- **`scripts/docs/generate-role-matrix.ts`** – Consumes the controller specs to generate the per-resource permission/role documentation matrix.

## Notes

- `fillOmittedWithNull` only fills fields whose *PUT* schema accepts `null`; a non-nullable omitted field is left unchanged (a 422 is the caller's responsibility via the required schema), never silently nulled.
- `keptWhenOmitted` exists because some fields (e.g. `imageUrl`) are nullable in the schema but represent server-side artifacts a client cannot echo back; a PUT that omits them must not clear them.
- `completeReplace` is the escape hatch for keyed sub-maps (like `translations` keyed by locale) where "absent from body" ≠ "null the key"—it lets the module explicitly set those keys to `null` so the shared `update` treats them as `$unset`.
- The pipeline reuses the **PATCH** output type (`TPatch['_output']`) as the contract for `update()`; a filled PUT body is cast to that type because every field it adds is one the PUT schema itself accepts as nullable.
- `versioned: false` means the `If-Match` header is silently ignored—the route will never return 412. Useful for resources whose contract does not declare optimistic concurrency.
