---
source: src/infrastructure/http/ids.ts
sha256: a48cdd32269a1b7e8d5db24e32eb6a7308c3896ca3e1ebec2790a73709e7f59f
generated_at: 2026-11-14T18:00:35.220171+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/ids.ts

## Purpose

Centralises the one-answer-per-position rule for malformed IDs (values that are not 24-char ObjectIds). A malformed ID in a URL path gets a 404 identical to an unknown ID; one in a body field or query parameter gets a 422 `VALIDATION_ERROR` naming the field. This keeps the distinction in a single module so controllers and generated schemas stay agnostic.

## Key elements

- **`CONTRACT_ID_PATTERN`** — The regex (`^[0-9A-Za-z_-]+$`) that identifies an `Id` field in generated Zod schemas. Pinned by `tests/cross-cutting/contract-scalars.test.ts` to the OpenAPI spec.
- **`RequiredId`** (interface) — Options for `requireId`: the `notFound` answer (i18n key, copy builder, or `null`), the param/field `name`, and the `surface` (path vs. body/query).
- **`requireId`** — Reads the single ID a route is about via `readInput`. Returns the ID string, or sends a 404 (path) / 422 (body/query) and returns `undefined`.
- **`malformedIdIssues`** — Given a Zod schema and the raw request input, walks the schema to find every `Id` field, checks the corresponding value in the input, and returns one `ResponseErrorItem` per string value that fails `isObjectIdString`. Skips fields already flagged by the schema's own validation to avoid duplicate 422 items.
- **`idPathsOf` / `collectIdPaths`** (internal) — Depth-first walk of a Zod 4 schema's `_zod.def` tree to enumerate all ID field paths (including inside arrays, unions, intersections, pipes, and transparent wrappers). Results are cached per schema instance via a `WeakMap`.
- **`carriedAt`** (internal) — Resolves a schema path (with `'*'` for array elements) to concrete dotted field names and their values in the request input.
- **`fieldIdIssue`** (internal) — Builds the 422 error item, choosing between "required" and "invalid-format" copy based on whether the value is `undefined`.

## Relationships

- **`@infrastructure/http/request`** — Imports `readInput` and `RequestSurface` to extract the ID value from the request at the correct surface.
- **`@infrastructure/http/response`** — Imports `fieldError`, `rejectResponse`, and `ResponseErrorItem` to build and send the 404/422 envelopes.
- **`@infrastructure/http/validation-messages`** — Imports `attributeOf` to derive a human-readable attribute name from a dotted field path for i18n messages.
- **`@infrastructure/i18n`** — Imports `t` to translate validation messages.
- **`@infrastructure/object-guards`** — Imports `isPlainObject` to safely index into request bodies during `carriedAt`.
- **`@infrastructure/persistence/create-repository`** — Imports `isObjectIdString`, the canonical 24-hex-char check that defines "this backend's own ID."
- **Controller / surface files** (`controller.ts`, `create-item-controller.ts`, `create-delete-controller.ts`, `create-update-controller.ts`, `create-restore-controller.ts`) — Call `requireId` for path IDs and `malformedIdIssues` for body/query IDs before or after Zod validation.
- **Module controllers** (`delete-session.ts`, `get-session.ts`, `delete-address.ts`) — Concrete routes that pass a `RequiredId` descriptor to `requireId` and forward `malformedIdIssues` results into their 422 responses.

## Notes

- The contract `Id` pattern is deliberately looser than a strict ObjectId regex, so a value can satisfy the schema and still be rejected here. This is intentional: the schema enforces a storage-neutral bound, while this file enforces the backend's actual ID shape.
- `requireId` distinguishes path vs. body/query purely by checking `Object.hasOwn(request.params, name)` — no extra config needed.
- `malformedIdIssues` only judges **string** values; missing or mistyped fields are left to Zod's own error to avoid duplicate 422 items on the same field.
- The schema walk reads Zod 4's `_zod.def` internals (documented as the supported tooling hook at `zod.dev/library-authors`). Zod 3 schemas will silently return no ID paths.
- Results of `collectIdPaths` are memoised in a `WeakMap` keyed by schema object, so a controller's schema is walked once at module-load time, not per request.
