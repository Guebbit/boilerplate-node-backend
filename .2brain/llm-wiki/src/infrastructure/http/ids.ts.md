---
source: src/infrastructure/http/ids.ts
sha256: a084f8aabbed30c3a18a5621969b7552da4221cd136a5eeb7ad9835ef245599a
generated_at: 2026-11-08T03:29:41.302140+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/ids.ts

## Purpose

Centralises the single rule for malformed id values: a path id that is not a valid 24-hex ObjectId answers **404** (indistinguishable from an unknown id), while a body/query id that fails the same check answers **422 `VALIDATION_ERROR`** naming the field. It also provides a schema-walk helper that finds every id-typed field in a Zod request schema so controllers can report all malformed ids in one pass.

## Key elements

- **`CONTRACT_ID_PATTERN`** (exported) — the loose regex (`^[0-9A-Za-z_-]+$`) the contract's shared `Id` scalar carries in generated Zod schemas. Used to *recognise* which string fields are ids, not to validate them.
- **`isValidObjectId(id)`** (exported type guard) — returns true only for exactly-24-hex-character strings. The `id is string` signature narrows the value for downstream use.
- **`RequiredId`** (exported interface) — config object for `requireId`: `notFound` (i18n key / copy-builder / `null`), optional `name` (default `'id'`), optional `surface` (default `'path'`).
- **`requireId(request, response, RequiredId)`** (exported) — reads one id via `readInput`, returns it if valid; otherwise rejects 404 (path param) or 422 (body/query field) and returns `undefined`.
- **`malformedIdIssues(schema, input, flagged?)`** (exported) — walks the Zod schema to locate all id fields, extracts the raw values the request actually carried, and returns one `fieldError` item per string value that is not a valid ObjectId. Skips fields the schema already flagged.
- **`OBJECT_ID_PATTERN`** (module-private) — `/^[\da-f]{24}$/i`, the strict shape this backend actually issues.
- **`TRANSPARENT`** (module-private set) — Zod wrapper types (`optional`, `nullable`, `default`, etc.) that are skipped during the schema walk.
- **`collectIdPaths` / `idPathsOf`** (module-private) — depth-first walk over a Zod schema's internal `_zod.def` tree; results are cached per schema instance in a `WeakMap`.
- **`carriedAt`** (module-private) — resolves a schema `IdPath` (which may contain `'*'` for array elements) against the raw request value to produce concrete dotted field names.

## Relationships

- **`src/infrastructure/http/request.ts`** — imports `readInput` and the `RequestSurface` type; `requireId` delegates all input reading to this module.
- **`src/infrastructure/http/response.ts`** — imports `fieldError`, `rejectResponse`, and the `ResponseErrorItem` type used to build both the 404 and 422 payloads.
- **`src/infrastructure/http/validation-messages.ts`** — imports `attributeOf` to derive the human-readable attribute name from a dotted field path for i18n interpolation.
- **`src/infrastructure/i18n/context.ts`** (via `@infrastructure/i18n`) — imports `t` to resolve translation keys (`validation.required`, `validation.invalid-format`) and to call `notFound` copy-builders.
- **`src/infrastructure/object-guards.ts`** — imports `isPlainObject` for safe property access inside `carriedAt`.
- **`src/infrastructure/http/controller.ts`** and the **`src/infrastructure/surfaces/create-*-controller.ts`** files — consume `requireId` / `malformedIdIssues` to enforce id validity at the controller layer.
- **`src/modules/*/controllers/*.ts`** (e.g. `delete-session`, `get-address`) — call `requireId` with a module-specific `notFound` value, tying the generic 404/422 logic to each resource's response copy.

## Notes

- The contract's `Id` pattern (`CONTRACT_ID_PATTERN`) is deliberately looser than `OBJECT_ID_PATTERN`. A value can pass the contract regex (e.g. `abc`) yet still be rejected by `isValidObjectId`—that gap is exactly what this module catches.
- `malformedIdIssues` only flags **string** values that fail the ObjectId check. Non-string values (numbers, null, missing keys) are left to the Zod schema's own validation to avoid duplicate error items on the same field.
- The Zod schema walk accesses `_zod.def`, which Zod's library-author docs designate as the supported tooling hook. It is intentionally shallow: the walker reads only the keys it tests for, so unknown wrapper types are simply skipped.
- Schema-walk results are cached in a `WeakMap<object, IdPath[]>` keyed by the schema instance, so a controller's schema is traversed once at module load (or first use), not per request.
- `requireId` distinguishes path vs. body by checking `Object.hasOwn(request.params, name)` rather than relying solely on the `surface` option—this keeps the 404/422 decision tied to where the value actually arrived.
