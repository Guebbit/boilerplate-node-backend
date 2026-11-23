---
source: src/infrastructure/http/request.ts
source_sha256: 2de45c20ffe217a900b7be2c81bdb2c691b206799f548a697fd4a1f68bb1ec3a
context_sha256: 33fde4a01ad9182a65b4a0d0058107ae984ac805f158adb5068380f251ae9443
generated_at: 2026-11-22T02:53:42.174999+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/request.ts

## Purpose
Multi-source input binding for Express routes. A value can arrive as a route param, a query string, or a JSON/multipart body field. This module holds the rules for merging those sources behind one entry point, `readInput`, so a single controller can serve an operation and its aliases (`GET /products?text=x` and `POST /products/search {text}`) without duplicating the handler.

## Key elements
- **`readInput(request, declaration)`**: the main entry point. It reads a route's input according to a `RequestInputDeclaration` and returns a `Record<string, unknown>`. Declared `ids` are typed `string`. It applies four rules:
  - The highest-precedence source that carries a key wins, whatever its value. Declared `ids` are the exception: they use a `||` chain, so an empty value falls through to the next source.
  - Explicit `undefined` keys are dropped.
  - Absent fields stay absent. They are not defaulted to `false` or `[]`, so a partial update can't wipe unsent data.
  - Only string transports (params, query, multipart body) are decoded. A JSON body keeps its own types.
- **`RequestInputDeclaration<TId>`**: the per-route declaration.
  - `surface` sets which sources are read and in what order.
  - Optional field lists control decoding: `ids`, `booleans`, `anyTrue`, `numbers`, `stringArrays`, `csvLists`, `jsonFields`.
  - These lists do not add sources. They only say how specific fields are resolved or decoded.
- **`RequestSurface`**: a closed union of `'search' | 'list' | 'write' | 'create' | 'delete' | 'path'`.
- **`RequestInputSource`**: `'params' | 'body' | 'query'`.
- **`SURFACE_SOURCES`** (module-private): maps each surface to its sources, highest precedence first.
  - `search`: body, then query.
  - `list`: query only.
  - `write`: params, then body.
  - `create`: body only.
  - `delete`: params, then query.
  - `path`: params only.
- **`bodyRecordOf(request)`**: returns `request.body` as a plain object. `undefined`, arrays, and scalars collapse to `{}`. It accepts `Pick<Request, 'body'>`.
- **`parseFormBoolean`** (exported): decodes boolean words from strings via `parseBooleanWord`. Non-strings and unrecognised strings are returned untouched.
- **`parseFormCsvList`** (exported): splits comma-separated strings, including repeated keys given as arrays, into trimmed tokens. A blank result becomes `undefined`. Values that are not strings all the way down are returned untouched.
- **`parseFormNumber`** and **`parseFormJson`** (module-private): decode numbers and JSON-encoded strings.
  - An empty string stays as is for numbers.
  - Invalid JSON stays as is.

## Relationships
- **`src/infrastructure/config/fields.ts`**: supplies `parseBooleanWord`, which `parseFormBoolean` uses.
- **`src/infrastructure/object-guards.ts`**: supplies `isPlainObject` (used by `bodyRecordOf`) and `stripUndefined`.
- **`@guebbit/js-toolkit`** (external package): supplies `coerceStringArray` and `getJson`.
- **`src/infrastructure/http/schemas.ts`**: reuses the exported `parseFormBoolean` for its multipart boolean schemas, which need the same decode ahead of their own boolean validation.
- **`src/infrastructure/http/uploads.ts`**: calls `bodyRecordOf`. That is why the function is typed on `Pick<Request, 'body'>`.
- The controller factories under `src/infrastructure/surfaces/` (`create-delete-controller.ts`, `create-list-controller.ts`, `create-search-controller.ts`, `create-update-controller.ts`) are neighbors, and the surface names (`search`, `list`, `write`, `create`, `delete`) match them. They are presumably the consumers of `readInput`, but the visible code does not show the call sites.

## Notes
- This layer decodes a transport and does not validate. Anything it can't recognise is passed through intact so the downstream schema reports the error. For example, `?hardDelete=false` must not become `true`, which is why `!!value` is not used.
- `anyTrue` fields (such as `hardDelete`) are OR'd across sources instead of ranked. A stated `true` wins, an undecodable value is passed through, and otherwise the result is `false` (absent if nothing stated one). They are automatically decoded as booleans.
- Decoding runs per source, before merging, because `?active=false` is always a string while `{"active": false}` never is. Only keys that are present are touched.
- `csvLists` are split only on string transports. A JSON body's array is taken as sent.
- The surface set is deliberately closed. A new surface must be added to `SURFACE_SOURCES` and reviewed deliberately against the request-input spec referenced in the file's doc comments.
