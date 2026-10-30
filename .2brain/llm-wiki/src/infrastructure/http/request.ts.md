---
source: src/infrastructure/http/request.ts
sha256: 2712e9e99af77447796218a8df71c195e2bde9d00c53671305ae664b84a55bcf
generated_at: 2026-10-29T02:05:08.248617+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/request.ts

## Purpose

Defines the multi-source input-binding rules for HTTP endpoints: a single value may arrive via route param, query string, or request body, and the same controller often serves multiple shapes of the same operation (e.g. `GET /products?text=x` vs `POST /products/search`). This module centralises the precedence, decoding, and merge logic behind one entry point (`readInput`) so controllers declare *what* they read rather than re-assembling extraction at each call site.

## Key elements

- **`readInput<TId>`** *(exported)* — The sole entry point. Accepts an Express `Request` and a `RequestInputDeclaration<TId>`, then reads, decodes, and merges the value across the surface's sources in precedence order. Returns `Record<string, unknown> & Partial<Record<TId, string>>`.
- **`RequestInputDeclaration<TId>`** *(exported interface)* — Per-route declaration: `surface` (drives source precedence), plus decode hints (`ids`, `booleans`, `anyTrue`, `numbers`, `stringArrays`, `csvLists`, `jsonFields`). The decode fields do not add sources; they only specify *how* specific fields are decoded on string transports.
- **`RequestSurface`** *(exported type)* — Closed set: `'search' | 'list' | 'write' | 'create' | 'delete' | 'path'`. Adding a new value is a deliberate, reviewable change.
- **`RequestInputSource`** *(exported type)* — `'params' | 'body' | 'query'`.
- **`SURFACE_SOURCES`** *(module-internal const)* — Closed mapping of each surface to its ordered source list (highest precedence first).
- **`parseFormBoolean`** *(exported)* — Decodes a string-transported boolean (`'true'`/`'false'`). Non-string values pass through untouched. Exported so `schemas.ts` can reuse it in multipart boolean schemas.
- **`parseFormCsvList`** *(exported)* — Splits a comma-separated string (or array of such strings) into trimmed tokens; returns `undefined` for an all-blank result.
- **`parseFormNumber`**, **`parseFormJson`** *(module-internal)* — Same "decode-or-pass-through" pattern for numbers and JSON-encoded strings on string transports.
- **`bodyRecordOf`** *(exported)* — Safely narrows `request.body` to `Record<string, unknown>`; non-object bodies (array, scalar, `undefined`) collapse to `{}`. Accepts `Pick<Request, 'body'>` so callers that don't have the full request (e.g. `uploads.ts`) can use it.

## Relationships

- **`src/infrastructure/config/fields.ts`** — Imports `parseBooleanWord`, the low-level string→boolean mapping used inside `parseFormBoolean`.
- **`src/infrastructure/object-guards.ts`** — Imports `isPlainObject` (used in `bodyRecordOf`) and `stripUndefined` (used in the merge logic of `readInput`).
- **`src/infrastructure/http/schemas.ts`** — Consumes `parseFormBoolean` for multipart boolean field schemas; this file is its decode dependency.
- **`src/infrastructure/http/uploads.ts`** — Calls `bodyRecordOf` with a partial request object (`Pick<Request, 'body'>`).
- **`src/infrastructure/surfaces/create-search-controller.ts`**, **`create-list-controller.ts`**, **`create-create-controller.ts`**, **`create-update-controller.ts`**, **`create-delete-controller.ts`** — The controller factories that call `readInput` with a `RequestInputDeclaration` matching their surface; they no longer implement per-field extraction themselves.
- **`src/infrastructure/http/ids.ts`** — Provides the ID-type context for the `TId` generic parameter threaded through `RequestInputDeclaration` and `readInput`.

## Notes

- **Precedence is a property of the surface, not of the controller.** The source ordering lives in the closed `SURFACE_SOURCES` map; a new combination requires a deliberate addition, not a per-call-site reordering.
- **Decode is source-aware, not value-aware.** The same key is decoded only if it arrived on a string transport (params, query, or multipart body). A JSON body's native types are never re-parsed.
- **`anyTrue` fields escape precedence ranking.** They are OR'd across all sources (any `true` wins) rather than ranked, because a default-shaped `false` in a lower-precedence source must not mask an explicit `true` in a higher one. `hardDelete` is the canonical case.
- **Absent ≠ empty.** An absent key is left absent (not defaulted to `false`/`[]`/`''`), so a partial update cannot wipe a field the caller simply didn't send. An explicit `undefined` is dropped to avoid leaking a Mongoose filter clause.
- **`null` vs `undefined` in `parseFormJson`.** The guard uses `parsed === undefined` (not `??`) because valid JSON can decode to `null`, `0`, or `''`, all of which `??` would incorrectly treat as parse failures.
- **This layer decodes, it does not validate.** Anything it cannot recognise is passed through as-is so the downstream Zod schema can produce the appropriate rejection message.
