---
source: src/infrastructure/http/request.ts
sha256: 8b6a6a78204729a10f8acf9ead6cbe29dcc4fde5ad98015402abc84ee06b3173
generated_at: 2026-09-23T17:45:31.586069+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/request.ts

## Purpose

Owns the rules for reading a route's input from multiple sources (route params, query string, JSON body, multipart body) behind a single entry point, `readInput`. This lets one controller serve both `GET /products?text=x` and `POST /products/search {text}` without duplicating handler logic, and keeps the multi-source precedence and string-transport decoding logic out of every individual controller.

## Key elements

- **`readInput<TId>(request, declaration)`** — The sole public entry point. Merges values from the sources declared by the route's `surface`, applies per-source decoding (booleans, numbers, string arrays, JSON fields), drops explicit `undefined` keys, and returns a flat `Record<string, unknown>` (with declared IDs typed as `string`).
- **`RequestInputDeclaration<TId>`** — Interface a controller passes to `readInput`. Declares the `surface` (which governs source precedence), plus optional field lists for `booleans`, `numbers`, `stringArrays`, `jsonFields`, `anyTrue`, and `ids`.
- **`RequestSurface`** — Closed union: `'search' | 'list' | 'write' | 'create' | 'delete' | 'path'`. Each surface maps to a fixed, ordered source list (e.g. `search` → body then query; `list` → query only; `delete` → params, query, body).
- **`RequestInputSource`** — Union `'params' | 'body' | 'query'`; the three physical locations a value can arrive from.
- **`parseFormBoolean(value)`** _(exported)_ — Decodes a string to `boolean` via `parseBooleanWord`; returns the value untouched if it isn't a recognisable boolean word. Exported for `schemas.ts` multipart boolean schemas.
- **`parseFormJson(value)`** _(exported)_ — Decodes a JSON-encoded string to its parsed value; returns the original string on failure. Uses `=== undefined` (not `??`) so valid JSON `null`/`0`/`''` are preserved.
- **`bodyRecordOf(request)`** _(exported)_ — Safely narrows `request.body` to `Record<string, unknown>`, collapsing arrays, scalars, and `undefined` to `{}`. Typed against `Pick<Request, 'body'>` so callers like `uploads.ts` that only carry the body field can pass it.
- **`parseFormNumber(value)`** _(module-private)_ — Decodes a non-empty string to a finite number; leaves empty strings and non-numeric strings untouched.
- **`SURFACE_SOURCES`** _(module-private)_ — The closed precedence map from surface → ordered source array.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse` for error signaling.
- **`src/infrastructure/i18n/index.ts`** — Imports the `t` translation function; messages are resolved against the locale set by the i18n middleware upstream.
- **`src/infrastructure/runtime/environment.ts`** — Imports `parseBooleanWord`, the primitive used inside `parseFormBoolean`.
- **`src/infrastructure/persistence/factories.ts`** — Imports `stripUndefined` for cleaning decoded values.
- **`src/infrastructure/http/schemas.ts`** — Consumes the exported `parseFormBoolean` for its multipart boolean schemas ahead of its own `z.boolean()` validation.
- **`src/infrastructure/http/uploads.ts`** — Passes a `Pick<Request, 'body'>` into `bodyRecordOf` (it carries only the body, not the full request).
- **`src/infrastructure/surfaces/create-search-controller.ts`**, **`create-list-controller.ts`**, **`create-delete-controller.ts`** — Primary consumers of `readInput`; each declares a `RequestInputDeclaration` matching its `surface` (`search`, `list`, `delete` respectively).
- **`src/kernel/middlewares/authorizations.ts`**, **`src/infrastructure/observability/metrics-http.ts`**, **`src/infrastructure/http/middlewares/{cache,idempotency,rate-limit}.ts`** — Upstream middleware in the Express chain; they run before a controller calls `readInput`, so the request they see is the same object this module reads from.

## Notes

- Decoding is **per-source**, not on the merged result. A JSON body is never decoded (it already carries real types); only `params`, `query`, and `multipart/form-data` bodies go through the decode pass. This is gated on whether the declaration actually lists any decodable fields.
- `anyTrue` fields (e.g. `hardDelete`) are **OR'd across sources** rather than ranked: any source supplying `true` wins. They are automatically treated as booleans for decoding purposes without the caller needing to also list them in `booleans`.
- An absent key stays absent. The module never injects `false`, `[]`, or `null` defaults — partial updates must not wipe fields the client didn't send.
- `rejectResponse` is imported but the visible portion of the file (truncated) doesn't show a call site; it is likely used in the remainder of `readInput` for declaration-validation errors.
- `express` is imported as a **type-only** dependency (`import type { Request, Response }`); this file adds no runtime Express dependency.
