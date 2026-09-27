---
source: src/infrastructure/surfaces/create-update-controller.ts
sha256: 97dd173cf0f4e29b2d86f24edb7d9cb46f367b8da79b93b7e307a0b4cacd7f1a
generated_at: 2026-09-27T14:17:38.750228+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-update-controller.ts

## Purpose

A shared factory that produces a pair of Express handlers — `replace` (PUT) and `update` (PATCH) — for any resource. Both verbs funnel through a single pipeline; the only differences are which Zod schema validates the body and whether omitted clearable fields are back-filled with `null` (PUT) or left absent (PATCH). Each module supplies its own schema, `update` service call, and row projection; this file owns the HTTP ceremony around them.

## Key elements

- **`UpdateControllerSpec`** — the per-entity configuration object: `entity` name, `replaceSchema`, `patchSchema`, optional `input` declaration, the module's `update` service call, a `present` row-shaping function, and an optional `idFrom` override.
- **`clearableFields(schema)`** — inspects a Zod schema at controller-build time and returns the names of fields whose schema accepts `null`. Used once per controller, not per request.
- **`fillOmittedWithNull(body, fields)`** — returns a shallow copy of `body` with every name in `fields` set to `null` if not already present. Implements RFC 9110 §9.3.4 "PUT replaces" semantics by converting omissions into explicit nulls.
- **`createUpdateController(spec)`** — the main export. Closes over `clearableFields(replaceSchema)` once, then returns two named Express handlers: `replace` (validates with `replaceSchema`, fills omissions) and `update` (validates with `patchSchema`, no filling). Both resolve the id, parse the body via `readInput`/`parseBody`, delegate to `spec.update`, shape the result with `spec.present`, and send a `200` or an error envelope.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies the HTTP primitives this file composes: `namedHandler`, `operationName`, `parseBody`, `refused`, `catchAs`, and the `ServiceResult` type.
- **`src/infrastructure/http/request.ts`** — supplies `extractAndValidateId`, `readInput`, and the `RequestInputDeclaration` type for multipart/form input.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` used to send the 200 body.
- **Module update controllers** (`update-account.ts`, `update-address.ts`, `update-feedback-status.ts`, `update-locale.ts`, `update-order.ts`, `update-product.ts`, `update-user.ts`, `update-subscription.ts`) — each calls `createUpdateController` with its own spec and registers the returned `replace`/`update` handlers on the router.
- **`scripts/docs/generate-role-matrix.ts`** — reads registered controllers to build the role/permission documentation matrix.
- **`tests/unit/infrastructure/surfaces/create-update-controller.test.ts`** — unit-tests the factory, `clearableFields`, and `fillOmittedWithNull`.

## Notes

- `clearableFields` is computed **once** at controller-build time (the schema is static), not per request.
- A field is "clearable" only if its Zod schema actually passes `null` through `safeParse`. Non-nullable fields (e.g. a required password) are left untouched when omitted from a PUT body — they are not zeroed.
- The `update` service call is responsible for translating `null` → `$unset` in the database write; this file only guarantees that `null` appears in the `changes` object.
- `readInput` is called with `surface: 'create'` to avoid merging a path-param `id` into the body object, which would violate a strict body schema.
- The `as TPatch['_output']` cast on the filled PUT body is safe because every added field is one the PUT schema itself accepts `null` for, making it structurally compatible with the patch schema's output type.
