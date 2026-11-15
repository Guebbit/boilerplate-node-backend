---
source: src/infrastructure/http/request.ts
sha256: 342dba2817090530a67a0ce4b3bc047214022c75543afa23365174fb2033decc
generated_at: 2026-11-14T18:05:51.359193+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/request.ts

## Purpose

Owns the multi-source input-binding rules for HTTP endpoints. A value may arrive as a route param, query-string key, or body field, and one controller often serves both an operation and its aliases (e.g. `GET /products?text=x` and `POST /products/search {text}`). This module centralises those rules behind a single `readInput` entry point and the string-transport decoders (boolean, number, JSON, CSV) so controllers never re-assemble binding logic.

## Key elements

- **`readInput`** — the sole public entry point. Given an Express `Request` and a `RequestInputDeclaration`, returns a flat `Record<string, unknown>` (plus typed ids) with the correct source precedence, string-transport decoding applied, and absent keys left absent.
- **`RequestInputDeclaration`** — the contract a controller passes to `readInput`. Declares `surface` (which dictates source precedence), plus optional field lists: `ids`, `booleans`, `anyTrue`, `numbers`, `stringArrays`, `csvLists`, `jsonFields`.
- **`RequestSurface` / `SURFACE_SOURCES`** — a closed enum of six surfaces (`search`, `list`, `write`, `create`, `delete`, `path`) and the hardcoded, highest-first source order for each. Adding a seventh requires a deliberate, reviewable change.
- **`parseFormBoolean`** (exported) / **`parseFormNumber`** / **`parseFormJson`** (private) / **`parseFormCsvList`** (exported) — decode a string-transported value into its typed form. All return the input untouched when they can't recognise it, so downstream validation reports the error.
- **`bodyRecordOf`** (exported) — safely collapses `request.body` to a plain `Record<string, unknown>` (returns `{}` for arrays, scalars, `undefined`). Typed by `Pick<Request, 'body'>` so callers that only carry the body (e.g. `uploads.ts`) can call it.
- **`RequestInputSource`** — the three possible sources: `'params' | 'body' | 'query'`.

## Relationships

- **`src/infrastructure/config/fields.ts`** — provides `parseBooleanWord`, the underlying word→boolean parser used by `parseFormBoolean`.
- **`src/infrastructure/object-guards.ts`** — provides `isPlainObject` (used in `bodyRecordOf`) and `stripUndefined`.
- **`src/infrastructure/http/schemas.ts`** — consumes the exported `parseFormBoolean` to decode boolean fields inside multipart schemas before validation.
- **`src/infrastructure/http/uploads.ts`** — calls `bodyRecordOf` (it only has `Pick<Request, 'body'>` available, which is why the signature is that narrow).
- **`src/infrastructure/surfaces/create-delete-controller.ts`** — calls `readInput` with `surface: 'delete'`; uses `anyTrue` for `hardDelete`.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — calls `readInput` with `surface: 'list'` (query-only).
- **`src/infrastructure/surfaces/create-search-controller.ts`** — calls `readInput` with `surface: 'search'` (body-before-query).
- **`src/infrastructure/surfaces/create-update-controller.ts`** — calls `readInput` with `surface: 'write'` (params-before-body).
- **`src/infrastructure/http/ids.ts`** — related to the `ids` field in `RequestInputDeclaration`; id resolution uses a `||` chain across sources rather than ranked precedence.

## Notes

- **Absent ≠ empty.** An absent key is never filled with a default (`false`, `0`, `[]`). This is what lets a partial update omit a field without wiping it.
- **`anyTrue` escapes precedence.** Fields listed in `anyTrue` are OR'd across all sources (any `true` wins) rather than ranked, because a default-shaped `false` from one source would otherwise outrank a meaningful `true` from another. They are implicitly added to the boolean decode set.
- **Decoding is per-source, not on the merged result.** A JSON body's `false` is already a boolean; a query string's `"false"` is a string. The decoder checks `typeof value === 'string'` before acting.
- **`parseFormJson` uses `=== undefined`, not `??`.** Valid JSON can decode to `null`, `0`, or `''`; `??` would incorrectly fall back to the raw string.
- **`readInput` returns `unknown` values.** It decodes the transport; it does not validate. Unrecognisable values pass through intact for the schema layer to reject.
- **`SURFACE_SOURCES` is intentionally closed.** The precedence ordering is a property of the surface, not a per-controller choice. A new combination must be added to the record and reviewed against the spec.
