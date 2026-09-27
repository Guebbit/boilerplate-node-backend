---
source: src/infrastructure/http/request.ts
sha256: da211c3035bad3c1dd5dff62ddd77a45d8c20e962f248dc5e13f9f8e22da4c81
generated_at: 2026-09-27T14:10:58.919139+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/request.ts

## Purpose

Defines the rules for reading a route's input from multiple possible sources (route params, query string, body) through a single entry point, `readInput`. This lets one controller serve both `GET /products?text=x` and `POST /products/search {text}` without duplicating handler logic, and keeps the source-precedence and type-decoding rules in one place rather than scattered across controllers.

## Key elements

- **`readInput<TId>(request, declaration)`** — The sole public entry point. Resolves a route's input by walking the surface's ordered source list, decoding string-transport fields, merging lowest-precedence first, stripping `undefined` keys, and resolving declared IDs. Returns `Record<string, unknown> & Partial<Record<TId, string>>`.
- **`RequestInputDeclaration<TId>`** — The per-route config object: `surface` (which sources to read), plus optional field lists (`ids`, `booleans`, `anyTrue`, `numbers`, `stringArrays`, `jsonFields`) that control how specific fields are decoded on string transports.
- **`RequestSurface`** — Closed union (`'search' | 'list' | 'write' | 'create' | 'delete' | 'path'`) that determines the source precedence order via the private `SURFACE_SOURCES` map.
- **`parseFormBoolean(value)`** *(exported)* — Decodes a string to `boolean`; returns the input untouched if unrecognisable so downstream validation can reject it. Also consumed by `schemas.ts` for multipart boolean schemas.
- **`parseFormJson(value)`** *(exported)* — Decodes a JSON-encoded string to a value; returns input untouched on failure. Also exported for `schemas.ts`.
- **`parseFormNumber(value)`** *(module-private)* — Decodes a string to a finite number; leaves empty strings alone (since `Number('')` is `0`).
- **`bodyRecordOf(request)`** *(exported)* — Safely narrows `request.body` (which Express types as `any`) to a plain `Record<string, unknown>`, collapsing arrays/scalars/`undefined` to `{}`. Accepts `Pick<Request, 'body'>` so `uploads.ts` can call it without a full request.
- **`RequestInputSource`** — Union `'params' | 'body' | 'query'`.

## Relationships

- **Imports** `parseBooleanWord` from `@infrastructure/runtime/environment` (shared boolean-word vocabulary).
- **Imports** `rejectResponse` from `@infrastructure/http/response` (error response helper).
- **Imports** `stripUndefined` from `@infrastructure/persistence/factories` (removes `undefined` keys before the result reaches Mongoose).
- **Imports** `t` from `@infrastructure/i18n` (locale-aware messages, already set up by i18n middleware before controllers run).
- **Exports consumed by** `@infrastructure/http/schemas.ts` (`parseFormBoolean`, `parseFormJson` for multipart boolean/JSON schemas).
- **`bodyRecordOf` consumed by** `@infrastructure/http/uploads.ts` (which passes `Pick<Request, 'body'>`).
- **`readInput` consumed by** the surface controllers (`create-search-controller`, `create-list-controller`, `create-update-controller`, `create-delete-controller`, `create-restore-controller`).

## Notes

- **`!!` pitfall:** `!!'false'` is `true`. All boolean parsing goes through `parseBooleanWord`; never use truthiness on string-transport booleans.
- **Empty-string numbers:** `Number('')` is `0`, but a blank field means "not sent." `parseFormNumber` explicitly guards this.
- **`parseFormJson` uses `=== undefined`, not `??`:** valid JSON can decode to `null`, `0`, or `''`, and `??` would incorrectly fall back to the raw string.
- **Multipart-only decoding:** Type coercion (boolean/number/array/JSON) applies only when the body is `multipart/form-data`. A JSON body keeps its native types; coercing it would mask contract violations.
- **`anyTrue` fields escape precedence:** OR'd across all sources rather than ranked, so a stated `true` in any source wins over a default-shaped `false` in a higher-precedence source. The canonical case is `hardDelete`.
- **`SURFACE_SOURCES` is a closed set:** Adding a new surface requires a deliberate, reviewable change to the map — there is no open-ended ordering.
- **Theory doc:** Deeper rationale lives in `docs/theory/request-input.md`.
