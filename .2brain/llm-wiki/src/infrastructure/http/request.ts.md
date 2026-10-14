---
source: src/infrastructure/http/request.ts
sha256: 0ae8d9f532d305c23b77fe12d05ec5e484083b8c0f7cb9253c65b9fa5dd9af73
generated_at: 2026-10-14T08:00:19.652361+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/request.ts

## Purpose

Centralises the rules for reading a route's input across multiple transport sources (route params, query string, JSON/multipart body). Exposes a single `readInput` entry point so controllers declare *what* they read (via a `RequestInputDeclaration`) rather than re-assembling extraction, decoding, and precedence logic per endpoint. This is what allows one handler to serve both `GET /products?text=x` and `POST /products/search {text}`.

## Key elements

- **`readInput<TId>(request, declaration)`** — The main entry point. Resolves values across the surface's sources by precedence, decodes string-transport types (boolean, number, string[], JSON, CSV list), resolves declared `ids`, and ORs `anyTrue` fields. Returns `Record<string, unknown>` (plus typed id fields) for downstream schema validation.
- **`RequestInputDeclaration<TId>`** — The per-route config object: `surface` (precedence rule), `ids`, `booleans`, `anyTrue`, `numbers`, `stringArrays`, `csvLists`, `jsonFields`.
- **`RequestSurface`** — Closed union: `'search' | 'list' | 'write' | 'create' | 'delete' | 'path'`. Maps to `SURFACE_SOURCES`, which defines the ordered list of `RequestInputSource`s each surface reads.
- **`RequestInputSource`** — `'params' | 'body' | 'query'`.
- **`parseFormBoolean`** (exported) — Decodes string `"true"`/`"false"` → boolean; unrecognisable values pass through untouched. Exported for `schemas.ts` multipart use.
- **`parseFormJson`** (exported) — Decodes a JSON-encoded string to its value; non-strings and invalid JSON pass through.
- **`parseFormCsvList`** (exported) — Splits comma-separated strings (or arrays thereof) into trimmed token arrays; empty → `undefined`.
- **`bodyRecordOf(request)`** (exported) — Safe extraction of `request.body` as `Record<string, unknown>`; non-object bodies collapse to `{}`.
- **`parseFormNumber`**, **`SURFACE_SOURCES`** — Internal helpers.

## Relationships

- **`src/infrastructure/object-guards.ts`** — Provides `isPlainObject` and `stripUndefined` used by `bodyRecordOf` and the merging logic.
- **`src/infrastructure/runtime/environment.ts`** — Provides `parseBooleanWord`, the core string→boolean decoder reused by `parseFormBoolean`.
- **`src/infrastructure/http/schemas.ts`** — Downstream validator that receives `readInput`'s `unknown` output; also imports `parseFormBoolean` for its own multipart boolean schemas.
- **`src/infrastructure/http/uploads.ts`** — Caller of `bodyRecordOf` (passes only `Pick<Request, 'body'>`); the file's decode logic handles multipart bodies it produces.
- **`src/infrastructure/surfaces/create-search-controller.ts`**, **`create-list-controller.ts`**, **`create-update-controller.ts`**, **`create-delete-controller.ts`** — Primary consumers; each calls `readInput` with a surface-appropriate `RequestInputDeclaration`.
- **`src/modules/account/controllers/cancel-pending-email.ts`** — Calls `readInput` for its route input.
- **`src/kernel/staff-read.ts`** — Reads request input for staff-facing operations.
- **`src/kernel/middlewares/authorizations.ts`**, **`src/infrastructure/http/middlewares/cache.ts`**, **`src/infrastructure/http/middlewares/rate-limit.ts`**, **`src/infrastructure/observability/metrics-http.ts`** — Interact with the request at a layer adjacent to (or before) `readInput`; they extract caller/tenant context, cache keys, or metric labels rather than the same field-decoding this module owns.

## Notes

- **Precedence is a property of the surface, not the controller.** `SURFACE_SOURCES` is a closed set; adding a new source combination requires a deliberate change here.
- **`anyTrue` fields (e.g. `hardDelete`) escape normal precedence.** They are OR'd across all sources — any stated `true` wins — because a default-shaped `false` should not outrank an explicit `true` on a lower-precedence source.
- **Absent is not empty.** A key not present in any source is left absent (not defaulted to `false`/`[]`), so partial updates cannot wipe unsent fields.
- **Decoding is transport-aware.** A JSON body's native `false`/`0`/array passes through untouched; only string transports (params, query, multipart) get parsed.
- **`readInput` does not validate.** It returns `unknown` on purpose; unrecognisable values are passed through intact for the Zod schema in `schemas.ts` to reject with a proper message.
- **`parseFormBoolean` uses `??`, not a ternary**, because `parseBooleanWord` only returns `boolean | undefined` — there is no falsy-but-valid case to guard. Conversely, `parseFormJson` uses `=== undefined` (not `??`) because valid JSON can decode to `null`, `0`, or `''`.
