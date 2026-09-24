---
source: src/infrastructure/persistence/search.ts
sha256: de6823e184b3e12a39791550adaa1f099c2bcbc236b48b6bd2ce94d94948d9dc
generated_at: 2026-09-23T17:50:48.000825+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/search.ts

## Purpose

Shared pagination and text-search helpers for Mongoose-based repositories. Centralises the coercion of raw request values into safe `skip`/`limit` pairs, the construction of `$regex`-based filters, and the "read every page" loop so that individual services don't reimplement (and subtly diverge in) the same logic.

## Key elements

- **`PaginationInput` / `PaginationResult` / `PaginatedMeta`** – Typed shapes for raw input, normalised output (`page`, `pageSize`, `skip`), and the envelope returned alongside a result page (`totalItems`, `totalPages`).
- **`FALLBACK_PAGE_SIZE` (10)** – Default page size when neither the caller nor the environment specifies one.
- **`MAX_CONFIGURED_PAGE_SIZE` (100)** – Hard ceiling on the env-configured default; mirrors the OpenAPI `PageSize.maximum` schema but is kept here because this code path is never validated by the edge schema.
- **`normalizePagination(input?)`** – Single authority for page/size defaults and `skip` derivation. Does **not** clamp out-of-range caller values (that's the HTTP schema's job); only guards against non-numeric / sub-1 inputs that would yield a negative or `NaN` skip.
- **`buildPaginatedMeta(pagination, totalItems)`** – Computes `totalPages` and assembles the response meta object.
- **`readAll<TItem>(fetchPage, pageSize)`** – Recursively pages until a short page signals the end; returns every collected item. Used by personal-data export paths where a truncated answer is unacceptable.
- **`escapeRegex(value)`** – Escapes all regex metacharacters so user text is matched literally (prevents ReDoS against public search endpoints).
- **`toSearchPattern(value)`** – Strips C0 control chars + DEL (a NUL would cause a 500 on a public endpoint), trims, escapes, and returns `undefined` when nothing searchable remains (an empty `$regex` would match *everything*).
- **`addTextFilter(where, text, fields)`** – Mutates a Mongoose filter with a case-insensitive `$or` across the given fields.
- **`addRegexFilter(where, field, value)`** – Mutates a Mongoose filter with a case-insensitive single-field `$regex`.
- **`DEFAULT_SORT`** – `{ createdAt: -1, _id: -1 }`. The `_id` tie-breaker makes pagination stable when concurrent creates share a `createdAt` millisecond, since count and page are separate queries.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** – Imports `environmentNumber` to read `NODE_SETTINGS_PAGINATION_PAGE_SIZE` at call time.
- **`src/infrastructure/persistence/create-repository.ts`** – Consumes `normalizePagination`, `buildPaginatedMeta`, `DEFAULT_SORT`, and the filter helpers when generating repository query methods.
- **Module services** (`api-keys/module.ts`, `audit-logs/module.ts`, `feedback/service.ts`, `inventory/service.ts`, `locales/services/entries.ts`, `orders/module.ts`, `orders/repository.ts`, `orders/services/crud.ts`, `payments/services/retention.ts`, `products/service.ts`, `users/service.ts`, `users/controllers/get-users.ts`) – Import these helpers to apply pagination, text search, or `readAll` in their respective query paths, keeping filter conventions in one place (OCP).
- **`src/modules/orders/tests/integration/repository.test.ts`** – Exercises the pagination and filter behaviour end-to-end through the orders repository.

## Notes

- `normalizePagination` intentionally does **not** cap the caller's `pageSize`; out-of-range values are rejected with a 422 upstream by `@infrastructure/http/schemas`. Clamping here would advertise a limit the API never actually enforced.
- `toSearchPattern` returning `undefined` (not `''`) is load-bearing: `$regex: ''` matches every document, so a term that vanishes under stripping would silently invert the filter into "return everything."
- `escapeRegex` handles metacharacters only; C0/DEL stripping is a separate concern in `toSearchPattern`. The two must be used together via `toSearchPattern` — calling `escapeRegex` alone on raw user input leaves NUL bytes that will 500 a public endpoint.
- `readAll` assumes `fetchPage` always requests the same fixed `pageSize`; a short page is the sole termination signal. If a caller passes a variable page size, the loop will never terminate.
