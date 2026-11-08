---
source: src/infrastructure/surfaces/create-update-controller.ts
sha256: cd56dd658d415e7c207139ddc959175752b2efbecbc51504a7d46bac04dca5d3
generated_at: 2026-11-08T03:51:41.683340+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-update-controller.ts

## Purpose

Shared factory for building PUT (replace) and PATCH (merge) update handlers. Every resource that supports one or both verbs composes its express routes from this file; the only per-entity differences are the Zod schemas, the domain `update` function, and a few optional flags. The file owns the entire request pipeline—ID resolution, body decoding, nullable-field filling (PUT only), versioned-write fencing, and ETag-bearing response—so modules never re-implement that plumbing.

## Key elements

- **`UpdateIdSource`** – Discriminated union: either a path-param id (with an optional non-default param name and a `notFoundKey`) or a request-derived id via an `idFrom(request)` callback.
- **`PatchControllerSpec<TPatch, TRow>`** – Per-entity spec for a PATCH-only controller: `entity` name, `versioned` flag, `patchSchema`, optional multipart `input` declaration, the module's `update(id, changes, request)` function, and a `present` projection for the response body.
- **`UpdateControllerSpec<TReplace, TPatch, TRow>`** – Extends the patch spec with `replaceSchema`, optional `completeReplace` (nulls keyed-map entries a PUT body omits), and optional `keptWhenOmitted` (fields that survive a PUT omission, e.g. an uploaded-file URL).
- **`clearableFields(schema)`** – Inspects a Zod object and returns the names of fields that accept `null`, i.e. the fields a PUT can clear by omitting them.
- **`idOf(source, request, response)`** – Resolves the row ID from the spec's `UpdateIdSource`; sends the not-found envelope and returns `undefined` on failure.
- **`pipelineOf(spec)`** – The core request pipeline (id → decode → validate → fill → complete → `update` under `If-Match` if versioned → ETag + `present` projection → 200). Returns a curried handler factory parameterised by operation name, schema, fill list, and optional `complete` step.
- **`createPatchController(spec)`** – Builds a single named express PATCH handler. For resources whose body can never represent the whole row.
- **`createUpdateController(spec)`** – Builds `{ replace, update }`: a PUT handler (fills clearable fields, optionally calls `completeReplace`) and a PATCH handler, both over the same pipeline.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies `namedHandler`, `operationName`, `parseBody`, `refused`, `catchAs`, and the `ServiceResult` type that `update` returns.
- **`src/infrastructure/http/ids.ts`** – `requireId` resolves the `:id` path param; called inside `idOf` for the path-param branch.
- **`src/infrastructure/http/preconditions.ts`** – `withIfMatch` wraps the write in an optimistic-concurrency check; `setEtag` stamps the response.
- **`src/infrastructure/http/request.ts`** – `readInput` decodes the multipart/form body into a plain object before schema validation.
- **`src/infrastructure/http/response.ts`** – `successResponse` sends the 200 body.
- **`src/infrastructure/object-guards.ts`** – `fillOmittedWithNull` inserts `null` for omitted clearable fields on the PUT path.
- **Module controllers** (`update-account`, `update-address`, `update-example`, `update-locale`, `update-order`, `update-product`, `update-user`, `update-subscription`) – Each imports `createUpdateController` or `createPatchController` and supplies its own schemas, `update` logic, and `present` projection.

## Notes

- `clearableFields` is computed once at controller-build time (outside the request handler), not per request, since the schema is static.
- `keptWhenOmitted` fields are excluded from the fill step: a PUT that omits them leaves the stored value untouched, while an explicit `null` in the body still clears them. This exists for fields a client cannot re-send (e.g. an uploaded image URL).
- `versioned: false` causes `withIfMatch` to be bypassed entirely; the route will never return 412.
- `readInput` is called with `surface: 'create'` deliberately, so path params are not merged into the decoded body object (which would violate a strict Zod schema).
- A `null` value in the `changes` object passed to `update` is the "clear this field" signal; converting it to a store-level `$unset` is the module's `update` function's responsibility, not this file's.
- `completeReplace` (PUT-only) runs after filling and is intended for keyed maps (e.g. product `translations`) where the schema cannot enumerate every possible key; it sets absent keys to `null`.
