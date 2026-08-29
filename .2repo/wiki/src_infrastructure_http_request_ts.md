# src/infrastructure/http/request.ts

## Purpose

Owns the multi-source input-resolution rules for HTTP endpoints so controllers don't re-assemble them. A single endpoint may accept the same field from a route param, query string, or JSON/form body; this module centralises the precedence, decoding, and collapse rules behind one entry point, `readInput`, keyed by a named "surface" declaration per route.

## Key elements

- **`RequestSurface`** (exported type) — closed set of route shapes: `'search' | 'list' | 'write' | 'delete' | 'path'`. Determines which sources are read and in what order.
- **`SURFACE_SOURCES`** — maps each surface to its ordered source list (e.g. `search → ['body','query']`, `delete → ['params','query','body']`).
- **`RequestInputDeclaration<TId>`** (exported interface) — per-route config: `surface`, `ids`, `booleans`, `anyTrue`, `numbers`, `stringArrays`. Describes *what* to decode, not *where* (surface handles that).
- **`anyTrue`** (field on declaration) — fields resolved by OR across all sources rather than by precedence. Exists for flags like `hardDelete` where a default-shaped `false` must not outrank an explicit `true`.
- **`readInput<TId>`** (exported function) — the single entry point. Takes an Express `Request` + a declaration, returns a `Record<string, unknown>` (with declared ids typed as `string`). Handles precedence fallback, explicit-`undefined` stripping, per-source type decoding, and `anyTrue` OR logic.
- **`parseFormBoolean` / `parseFormNumber`** (internal) — decode string-transported values. Unrecognisable values are returned untouched so the downstream Zod schema produces the contract's own 422 message.
- **`getRequestBody`** (internal) — reads `request.body` as `Record<string, unknown>`, guarding against Express 5 leaving it `undefined`.
- **`isMultipartRequest`** (internal) — boolean check used to decide whether body decoding applies (JSON bodies are never coerced).

## Relationships

- **`src/infrastructure/http/response.ts`** — imports `rejectResponse`; `readInput` can short-circuit to a rejection when input is malformed.
- **`src/infrastructure/i18n/index.ts`** — imports `t` for localised error messages surfaced during input resolution.
- **`src/infrastructure/http/delete-controller.ts`** — primary consumer of the `'delete'` surface and the `anyTrue` mechanism (e.g. `hardDelete` arriving via `routeFlag`, query, or body).
- **`src/modules/account/controllers/*`** (get-account, get-addresses, delete-session, delete-address, etc.) — consume `readInput` with their respective surface declarations.

## Notes

- **JSON bodies are never coerced.** Only multipart/form-data, route params, and query strings go through `parseFormBoolean`/`parseFormNumber`. Coercing a JSON body would swallow type violations (`!!'not-a-boolean'` → `true`) and turn a 422 into a 201.
- **`absent ≠ empty`.** A field no source supplied stays absent. Defaulting here would turn a partial `PATCH`/`PUT` into a full overwrite at the service layer.
- **`anyTrue` fields are implicitly booleans.** They are folded into the boolean decode set inside `readInput`; callers do not need to also list them in `booleans`.
- **The `SURFACE_SOURCES` map is intentionally closed.** Adding a new combination requires a deliberate, reviewable change rather than being inferred from whichever helper a controller reaches for.
- **`docs/theory/request-input.md`** holds the resolved endpoint × parameter table and documents known discrepancies with `openapi.yaml`.
- **Express 5 quirk:** `req.body` is `undefined` (not `{}`) when no body is sent. `getRequestBody` guards this; any code that bypasses it will 500 on body-less requests (e.g. `DELETE /cart/:productId`).
