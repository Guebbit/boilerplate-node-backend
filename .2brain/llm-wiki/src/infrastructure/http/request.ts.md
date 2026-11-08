---
source: src/infrastructure/http/request.ts
sha256: abd321be93978827547681c16d8ec11c2475fb48f05285f5e98f1f1d16fdbeb6
generated_at: 2026-11-08T03:34:15.598634+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/request.ts

## Purpose

Defines the multi-source input-binding rules for HTTP routes. A single value may arrive as a route param, query-string key, or JSON/multipart body field, and this module centralises the precedence, decoding, and OR-resolution logic so controllers call one entry point (`readInput`) instead of re-assembling extraction rules per endpoint. This is what lets `GET /products?text=x` and `POST /products/search {text}` share a handler.

## Key elements

- **`readInput<TId>`** — the single entry point. Takes an Express `Request` and a `RequestInputDeclaration`, returns a flat `Record<string, unknown>` (with typed ids) ready for downstream schema validation. Handles source precedence, per-source decoding, `anyTrue` OR-resolution, and drops explicit `undefined` keys.
- **`RequestInputDeclaration<TId>`** — the per-route config object: `surface` (which sources to read and in what order), plus optional field lists (`ids`, `booleans`, `anyTrue`, `numbers`, `stringArrays`, `csvLists`, `jsonFields`) that declare how specific keys should be decoded on string transports.
- **`RequestSurface` / `SURFACE_SOURCES`** — closed enum (`search`, `list`, `write`, `create`, `delete`, `path`) mapped to an ordered `readonly RequestInputSource[]`. Precedence is a property of the surface, not an ad-hoc per-controller choice.
- **`RequestInputSource`** — `'params' | 'body' | 'query'`.
- **`parseFormBoolean`** *(exported)* — decodes a string-transported value via `parseBooleanWord`; returns the original value unchanged if unrecognisable so the validator rejects it. Also used by `schemas.ts` for multipart booleans.
- **`parseFormNumber`** *(internal)* — decodes a string to a finite number; leaves empty strings and non-numeric strings untouched.
- **`parseFormJson`** *(internal)* — decodes a string as JSON via `getJson`; returns the original on failure or when `getJson` yields `undefined`.
- **`parseFormCsvList`** *(exported)* — splits a comma-separated string (or array of them) into trimmed tokens; returns `undefined` for a fully-blank value.
- **`bodyRecordOf`** *(exported)* — safely narrows `request.body` (typed `any` by Express) to a `Record<string, unknown>`, collapsing non-object bodies to `{}`. Typed by `Pick<Request, 'body'>` so callers like `uploads.ts` that lack a full `Request` can use it.

## Relationships

- **`src/infrastructure/config/fields.ts`** — imports `parseBooleanWord`, the shared word-to-boolean mapper used by `parseFormBoolean`.
- **`src/infrastructure/object-guards.ts`** — imports `isPlainObject` (used by `bodyRecordOf`) and `stripUndefined`.
- **`src/infrastructure/http/schemas.ts`** — imports `parseFormBoolean` to decode multipart boolean fields before applying `z.boolean()`.
- **`src/infrastructure/http/uploads.ts`** — calls `bodyRecordOf` with a `Pick<Request, 'body'>` (it does not hold a full `Request`).
- **`src/infrastructure/surfaces/create-search-controller.ts`**, **`create-list-controller.ts`**, **`create-update-controller.ts`**, **`create-delete-controller.ts`** — the primary consumers; each declares a `RequestInputDeclaration` and calls `readInput` to obtain the flat input record before schema validation.

## Notes

- **`??` vs. `=== undefined` in decoders.** `parseFormBoolean` uses `??` because `parseBooleanWord` only ever returns `boolean | undefined`. `parseFormJson` must use `parsed === undefined` because valid JSON can decode to `null`, `0`, or `''` — `??` would incorrectly fall back to the raw string in those cases.
- **`Number('')` is `0`.** `parseFormNumber` explicitly guards empty/whitespace strings to avoid turning "field not sent" into zero.
- **Decoding is per-source, not on the merged result.** A JSON body's `{"active": false}` must not pass through `parseFormBoolean`; only string transports (params, query, multipart) get decoded. The `decode` helper is applied independently to each source before precedence selection.
- **`anyTrue` fields escape normal ranking.** They are OR'd across all sources the surface reads (any `true` wins) rather than resolved by highest-source-wins. This exists for flags like `hardDelete` where a default-shaped `false` in a lower-priority source must not shadow an explicit `true` in a higher one.
- **`readInput` returns `unknown` values by design.** It is a decode layer, not a validation layer. Unrecognised values are passed through intact so the downstream Zod schema can produce its own error message.
- **Explicit `undefined` keys are dropped** before the result is returned, preventing them from leaking into Mongoose filter clauses as `{ key: undefined }`.
- The full precedence and design rationale lives in `docs/theory/request-input.md` (referenced in the module docblock and type comments).
