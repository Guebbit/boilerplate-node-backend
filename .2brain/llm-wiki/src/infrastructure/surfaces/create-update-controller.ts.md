---
source: src/infrastructure/surfaces/create-update-controller.ts
sha256: 7861be03905704a33d132c8a6e6c4a217d3e068ad4a3227fdef792d34949e414
generated_at: 2026-11-14T18:19:58.839025+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-update-controller.ts

## Purpose

Factory that builds the shared PUT (full replace) and PATCH (partial merge) handlers for any resource. Both verbs run one pipeline—resolve id → parse/validate body → (PUT only) fill omitted clearable fields with `null` and optionally complete the replace → call the entity's `update` (gated by `If-Match` on versioned resources) → respond with the shaped row—differing only in which schema validates the body and whether fields are filled.

## Key elements

- **`UpdateIdSource`** (type) — Discriminated union: either a path-param id (`notFoundKey` + optional `idParam`) or an `idFrom` callback (for routes with no `:id` in the path, e.g. "my" account).
- **`PatchControllerSpec<TPatch, TRow>`** (type) — Shared per-entity configuration: `entity`, `versioned`, `patchSchema`, optional `input` (multipart), the `update` function, and the `present` projection.
- **`UpdateControllerSpec<TReplace, TPatch, TRow>`** (type) — Extends the patch spec with `replaceSchema`, optional `completeReplace` (clears stored map keys the body omits), and optional `keptWhenOmitted` (fields a PUT must not wipe by mere omission, e.g. an uploaded file).
- **`clearableFields(schema)`** — Returns names of Zod fields that accept `null`, computed once at controller-build time.
- **`createPatchController(spec)`** — Exported factory for a PATCH-only update handler (no PUT is offered).
- **`createUpdateController(spec)`** — Exported factory returning `{ replace, update }`, two named Express handlers over the shared pipeline.
- **`pipelineOf(spec)`** (internal) — Curried builder: `(operation, schema, fills, complete?) → handler`. Orchestrates id resolution, body parsing, null-filling, optional completion, `If-Match` gating, ETag, and error handling.
- **`idOf(source, request, response)`** (internal) — Resolves the row id from the spec; returns `undefined` after sending a 404.

## Relationships

- **`@infrastructure/http/controller`** — Provides `namedHandler`, `operationName`, `parseBody`, `refused`, `catchAs`, and the `ServiceResult` type used throughout the pipeline.
- **`@infrastructure/http/ids`** — `requireId` resolves and validates the `:id` path param for the path-param id source.
- **`@infrastructure/http/preconditions`** — `withIfMatch` fences the write on versioned resources; `setEtag` stamps the response (PATCH only).
- **`@infrastructure/http/request`** — `readInput` decodes the body (including multipart); called with `surface: 'create'` so path params are not merged in.
- **`@infrastructure/http/response`** — `successResponse` sends the final 200 with the projected row.
- **`@infrastructure/object-guards`** — `fillOmittedWithNull` fills omitted clearable fields with `null` for PUT.
- **Module update controllers** (`update-account`, `update-address`, `update-example`, `update-locale`, `update-order`, `update-product`, `update-user`, `update-subscription`) — Each calls `createUpdateController` (or `createPatchController`) with its own spec to obtain its Express handlers.
- **`scripts/docs/generate-role-matrix.ts`** — Consumes the controller/operation naming to generate role-permission documentation.

## Notes

- **ETag asymmetry:** `setEtag` is called only when `request.method === 'PATCH'`. PUT responses carry no `ETag` (RFC 9110 §9.3.4); `dropUnownedValidators` enforces this at a higher layer.
- **`keptWhenOmitted`:** Fields listed here are excluded from `replaceFills`, so a PUT that omits them preserves the stored value. An explicit `null` in the body still clears them.
- **`completeReplace`:** Runs after null-filling and before `update`; it nulls stored map keys (e.g. product `translations` locales) that the PUT body omitted but the PATCH schema cannot name.
- **`clearableFields` is computed once** per `createUpdateController` call (derived from the immutable Zod schema), not per request.
- **`id === undefined` check** uses strict equality, not falsy, because `idFrom` can legitimately return `''` (a valid-but-matching-nothing id → the entity's own 404), whereas `undefined` means a refusal was already sent.
- **`readInput` surface is `'create'`**, not `'update'`, to prevent path params from leaking into the body object and failing the schema's strict parse.
