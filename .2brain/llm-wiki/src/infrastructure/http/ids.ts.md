---
source: src/infrastructure/http/ids.ts
sha256: a084f8aabbed30c3a18a5621969b7552da4221cd136a5eeb7ad9835ef245599a
generated_at: 2026-10-15T09:49:53.164969+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/ids.ts

## Purpose

Centralises the one-answer-per-position rule for malformed IDs: an ID in a URL path is indistinguishable from an unknown resource (404), while an ID in a body field or query parameter is a bad argument (422). It also inspects a request's Zod schema to locate every `Id`-typed field so controllers can produce the correct validation errors without re-deriving field paths on each request.

## Key elements

- **`CONTRACT_ID_PATTERN`** (exported) – The regex string the OpenAPI contract uses for its shared `Id` scalar; a string field carrying this pattern in its Zod `string_format` check is recognised as an ID.
- **`isValidObjectId(id: unknown): id is string`** (exported) – Type guard asserting exactly 24 hex characters; intentionally stricter than the contract's looser `Id` bound.
- **`RequiredId`** (exported interface) – Configuration object for `requireId`: the not-found copy (i18n key, builder function, or `null`), the param/field name, and the `RequestSurface`.
- **`requireId(request, response, opts)`** (exported) – Reads a single ID via `readInput`; on failure sends 404 (path) or 422 (body/query) and returns `undefined`.
- **`malformedIdIssues(schema, input, flagged?)`** (exported) – Walks a Zod schema to find ID fields, extracts the corresponding values from raw input, and returns one `ResponseErrorItem` per string value that fails `isValidObjectId`. Skips fields already flagged by the schema.
- **`collectIdPaths` / `carriedAt` / `idPathsOf`** (internal) – Depth-first Zod schema walker (objects, arrays, unions, intersections, pipes, transparent wrappers) and the corresponding input-value navigator. Results are memoised in a `WeakMap` keyed by the schema object.

## Relationships

- **`src/infrastructure/http/request.ts`** – Imports `readInput` and the `RequestSurface` type; `requireId` delegates ID extraction to `readInput`.
- **`src/infrastructure/http/response.ts`** – Imports `rejectResponse`, `fieldError`, and `ResponseErrorItem`; all 404/422 responses and per-field error items are built through these.
- **`src/infrastructure/http/validation-messages.ts`** – Imports `attributeOf` to turn a dotted field name into the i18n `attribute` token.
- **`src/infrastructure/i18n/index.ts`** – Imports `t` for translating `validation.required` / `validation.invalid-format` messages.
- **`src/infrastructure/object-guards.ts`** – Imports `isPlainObject` used by `carriedAt` to safely descend into nested input objects.
- **`src/infrastructure/surfaces/create-{delete,item,restore,update}-controller.ts`** and **`src/infrastructure/http/controller.ts`** – Surface factories and the generic controller consume `requireId` and/or `malformedIdIssues` to enforce the ID rule at their respective entry points.
- **`src/modules/account/controllers/*.ts`**, **`src/modules/addresses/controllers/*.ts`** – Concrete module controllers pass their own `notFound` copy and field name into `requireId`, or feed their request schema into `malformedIdIssues`.

## Notes

- `CONTRACT_ID_PATTERN` (`^[0-9A-Za-z_-]+$`) is deliberately looser than `OBJECT_ID_PATTERN` (`^[\da-f]{24}$/i`). A value can satisfy the contract's `Id` scalar and still be rejected by `isValidObjectId`; this file is the single place that draws that line.
- `idPathsOf` caches the schema walk in a `WeakMap`, so a controller's schema is traversed once at first use, not per request. The cache is tied to the schema object's identity.
- `malformedIdIssues` only judges values that are already strings. Missing or mistyped fields are left to the Zod schema's own error output to avoid emitting two items on the same field.
- The Zod walk reads the internal `_zod.def` structure. The file cites Zod's library-author documentation as the sanctioned hook for this kind of inspection; the traversal is intentionally shallow and only reads keys it explicitly tests.
- `isValidObjectId` rejects the 12-byte binary ObjectId form that Mongoose's `isValid` accepts, because no route in this API ever issues that form.
