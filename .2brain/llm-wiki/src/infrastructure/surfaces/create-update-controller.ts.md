---
source: src/infrastructure/surfaces/create-update-controller.ts
sha256: 309eb2d036d522a0653cc4b43db9c0de17e34808195cb906c7c9d4d94a288d06
generated_at: 2026-10-14T08:19:41.013040+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-update-controller.ts

## Purpose

Shared factory that builds a PUT (replace) and PATCH (merge) Express handler pair for any resource. Both verbs run through a single pipeline — resolve id, parse body, fill omitted clearable fields (PUT only), optionally run `completeReplace`, apply optimistic-concurrency fencing, and shape the response — differing only in which Zod schema validates the body and which fields get filled with `null`.

## Key elements

- **`createUpdateController(spec)`** — The main factory. Takes a `UpdateControllerSpec` and returns `{ replace, update }`, two named Express handlers wired to the shared `run` pipeline.
- **`UpdateControllerSpec`** — Per-entity configuration: `entity` name, `versioned` flag, `replaceSchema` / `patchSchema`, optional `input`, the module's `update` function, `present` projection, optional `completeReplace`, optional `keptWhenOmitted`.
- **`UpdateIdSource`** — Union type: either a path-param id (`notFoundKey` + optional `idParam`) or a computed id (`idFrom: (req) => string`).
- **`clearableFields(schema)`** — Returns the names of fields in a Zod schema that accept `null`, i.e. the fields a PUT clears by omission.
- **`fillOmittedWithNull(body, fields)`** — Returns a copy of `body` with every field in `fields` set to `null` if absent.
- **`idOf`** (module-private) — Resolves the row id from the source declaration; sends the not-found response and returns `undefined` on failure.

## Relationships

- **Consumed by** every module-level update controller: `update-account`, `update-address`, `update-example`, `update-feedback-status`, `update-locale`, `update-order`, `update-product`, `update-user`, `update-subscription`. Each passes its own spec and mounts the returned `replace`/`update` handlers on its routes.
- **Imports** core HTTP infrastructure: `successResponse` (response), `setEtag` / `withIfMatch` (preconditions), `readInput` / `RequestInputDeclaration` (request), `requireId` (ids), and `catchAs` / `namedHandler` / `operationName` / `parseBody` / `refused` / `ServiceResult` (controller).
- **`scripts/docs/generate-role-matrix.ts`** — Reads the operation names produced by `operationName('replace'|'update', entity)` to build documentation.

## Notes

- `replaceFills` is computed **once** at controller-build time (not per request) by calling `clearableFields` and filtering out `keptWhenOmitted` entries.
- `keptWhenOmitted` fields (e.g. an uploaded `imageUrl`) are **excluded** from the PUT fill: omitting them keeps the stored value, while an explicit `null` still clears them.
- `completeReplace` runs **only on PUT**, after filling, and is the mechanism for clearing stored keys of a keyed map (e.g. product `translations`) that the body left out.
- When `versioned` is `false`, the `If-Match` header is ignored entirely and no `412` is ever returned — the route's contract must not declare it.
- `parseBody` is called with `readInput(..., { surface: 'create' })` so that path params merged into the input object do not trip the body's strict schema.
