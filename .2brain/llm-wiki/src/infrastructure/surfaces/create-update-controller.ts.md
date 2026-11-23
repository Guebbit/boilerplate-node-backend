---
source: src/infrastructure/surfaces/create-update-controller.ts
source_sha256: 8cfd2b4af7fe7c511474270267d96c7b3ae5c3ec611ec597290a0a133fa64a9f
context_sha256: 581f99de94ae04b23c93cd73d21d2310993ce70bdbe565ef22d8282a21a45b50
generated_at: 2026-11-22T03:11:10.461816+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/surfaces/create-update-controller.ts

## Purpose
Provides the shared update controller for resources that accept both PUT (replace) and PATCH (merge). A single pipeline handles both verbs; only the front of it differs (which schema validates the body, whether omitted fields are filled with `null`, and an optional completion step for PUT). It exists so each module only declares what differs per entity.

## Key elements
- **`UpdateIdSource`** – union type: the row id comes either from a path param (`notFoundKey`, optional `idParam`) or from a caller-supplied `idFrom(request)` (for routes with no id in the path).
- **`PatchControllerSpec<TPatch, TRow>`** – per-entity spec: `entity`, `versioned` (whether `If-Match`/`412` is honored), `patchSchema`, optional multipart `input` declaration, `update(id, changes, request)` (module merge returning a `ServiceResult`), and `present(row, request)` (projection to contract shape).
- **`UpdateControllerSpec`** – extends the patch spec with `replaceSchema`, optional `completeReplace` (nulls stored map keys the body omitted) and `keptWhenOmitted` (fields whose omission keeps the stored value on PUT, e.g. an uploaded image).
- **`clearableFields(schema)`** – returns the names of fields whose schema accepts `null`; these are what a PUT clears by omission.
- **`idOf`** (private) – resolves the id via `idFrom` or `requireId`; returns `undefined` if a refusal was already sent.
- **`pipelineOf`** (private) – builds the shared handler: resolve id → `readInput` (surface `'create'`) → `parseBody` → `fillOmittedWithNull` → optional `complete` → `update()` (wrapped in `withIfMatch` if versioned) → `refused` check → `setEtag` (PATCH only) → `present` → `successResponse(…, 200)`; errors go through `catchAs`.
- **`createPatchController(spec)`** – PATCH-only handler (no PUT offered), named via `operationName('update', entity)`.
- **`createUpdateController(spec)`** – returns `{ replace, update }`: a PUT handler and a PATCH handler over one pipeline.

## Relationships
- Imports from `@infrastructure/http/*`: `controller` (`parseBody`, `refused`, `catchAs`, `namedHandler`, `operationName`, `ServiceResult`), `request` (`readInput`), `ids` (`requireId`), `preconditions` (`setEtag`, `withIfMatch`), `response` (`successResponse`).
- Uses `fillOmittedWithNull` from `src/infrastructure/object-guards.ts`.
- Consumed by module update controllers: account, addresses, example, locales, orders, products, users, and webhooks (`update-subscription.ts`), each supplying a spec.
- `scripts/docs/generate-role-matrix.ts` is a graph neighbor of this file; its interaction is not visible here.

## Notes
- PUT omission clears only nullable fields; a non-nullable field omitted is left unchanged, so the PUT schema should mark it `required` (omission becomes a 422).
- `keptWhenOmitted` fields are excluded from the PUT fill list, but an explicit `null` still clears them.
- `ETag` is set only on PATCH responses; PUT answers none (RFC 9110 §9.3.4, enforced by `dropUnownedValidators`).
- With `versioned: false`, `If-Match` is ignored entirely so the route never returns an undeclared `412`.
- The id check uses `=== undefined`, not falsy: an `idFrom` value may be `''`, which is an id matching no row (the update's own 404), not a sent refusal.
- Body is read with the body-only `'create'` surface because the id is already resolved and a path param in the object would fail the strict schema.
- `fills` and `complete` are computed once per controller, not per request.
