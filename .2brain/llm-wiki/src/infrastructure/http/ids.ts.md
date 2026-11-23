---
source: src/infrastructure/http/ids.ts
source_sha256: b726b3b0a4a4d5de98d60236f46b3dc88f585cac82fa7146d78fbbedcd6af2b6
context_sha256: b888e4fb438765eca4726c6856f21cacdf3bd3e18ed06e5523f578de00fe3aa5
generated_at: 2026-11-22T02:48:29.547719+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/ids.ts

## Purpose
Gives a malformed id a single, position-dependent answer. An id in the URL path yields a 404 (indistinguishable from a well-formed unknown id). An id in a body field or query filter yields a 422 `VALIDATION_ERROR` with `details.field` set to the field. "Malformed" means not this backend's own id (24 hex characters, checked via `isObjectIdString`). The contract's shared `Id` is looser, so a value can pass the schema and still be rejected here.

## Key elements
- `CONTRACT_ID_PATTERN` – the shared `Id` regex source (`^[0-9A-Za-z_-]+$`) used to recognise id fields in generated Zod schemas. A cross-cutting test checks that it still matches `openapi.yaml`.
- `RequiredId` – options interface for `requireId`:
  - `notFound` is an i18n key, a function returning a string or `ResponseErrorItem`, or `null` for the bare 404 envelope.
  - `name` is the param or field name, default `id`.
  - `surface` is a `RequestSurface`, default `path`.
- `requireId(request, response, { notFound, name, surface })` – reads the id through `readInput`. It returns the id if it is a valid ObjectId string. Otherwise it sends the refusal and returns `undefined`:
  - 404 with the module's not-found copy if `name` is in `request.params`.
  - 422 with a field error otherwise.
- `malformedIdIssues(schema, input, flagged?)` – returns 422 `ResponseErrorItem`s for every id field in `input` that is a string but not a valid ObjectId. Fields already in `flagged` are skipped.
- Internal helpers:
  - `fieldIdIssue` builds the error item. The message is `validation.required` when the value is `undefined`, otherwise `validation.invalid-format`.
  - `notFoundCopy` builds the 404 error list.
  - `collectIdPaths` walks a Zod schema through `_zod.def` and finds id locations.
  - `idPathsOf` caches those paths per schema in a `WeakMap`.
  - `carriedAt` resolves schema paths against the actual input and expands array indices into dotted fields.

## Relationships
- Uses `request.ts` (`readInput`, `RequestSurface`) to read the id by surface.
- Uses `response.ts` (`rejectResponse`, `fieldError`, `ResponseErrorItem`) to send and build errors.
- Uses `validation-messages.ts` (`attributeOf`) and `i18n` (`t`) for translated messages.
- Uses `object-guards.ts` (`isPlainObject`) when walking input.
- Uses `src/infrastructure/persistence/create-repository.ts` (`isObjectIdString`) as the id validity check.
- The surface controller factories (`create-delete-controller`, `create-item-controller`, `create-restore-controller`, `create-update-controller`) and module controllers such as `delete-session`, `get-session` and `delete-address` are neighbors. They are the likely consumers of `requireId` and `malformedIdIssues`; this file does not show their usage.

## Notes
- Only string values are judged in `malformedIdIssues`. Missing or mistyped fields are left to the schema, so one field never gets two items.
- The Zod walk handles these node types:
  - `string`
  - `object`
  - `array` (path segment `'*'`)
  - transparent wrappers (`optional`, `nullable`, `default`, `prefault`, `nonoptional`, `readonly`)
  - `pipe` (both sides)
  - `union`
  - `intersection`

  Other node types are not descended into.
- The walk depends on Zod 4's `_zod.def` internals. `isSchemaNode` is a shallow check, and a non-Zod schema yields no paths.
- The path-vs-422 decision uses `Object.hasOwn(request.params, name)`, so the matched route template decides it, not the `surface` option.
