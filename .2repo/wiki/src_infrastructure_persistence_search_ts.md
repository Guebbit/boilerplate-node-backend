# src/infrastructure/persistence/search.ts

## Purpose

Shared pagination and text-search helpers used by every repository `search` method. Exists so that pagination defaulting, regex escaping, and sort conventions live in one place (OCP), rather than being re-implemented in each module's repository or service.

## Key elements

- **`normalizePagination(input?)`** — Coerces `page`/`pageSize` (typed `unknown`) into a `PaginationResult` with a derived `skip`. Applies the deployment-tunable default (`NODE_SETTINGS_PAGINATION_PAGE_SIZE`, capped at 100, fallback 10) only when the caller did not supply a `pageSize`. Does **not** clamp caller values; that is the schema layer's job.
- **`buildPaginatedMeta(pagination, totalItems)`** — Builds the `PaginatedMeta` object (page, pageSize, totalItems, totalPages) for API responses.
- **`toSearchPattern(value)`** — Strips C0 control chars + DEL, trims, escapes all regex metacharacters. Returns `undefined` (not `''`) when nothing searchable remains, because `$regex: ''` would match every document.
- **`escapeRegex(value)`** — Pure metacharacter escaping; used by `toSearchPattern`.
- **`addTextFilter(where, text, fields)`** — Sets `where.$or` to a case-insensitive `$regex` clause across the given fields.
- **`addRegexFilter(where, field, value)`** — Sets a single-field case-insensitive `$regex` clause.
- **`DEFAULT_SORT`** — `{ createdAt: -1, _id: -1 }`. The `_id` tiebreaker makes the sort total, preventing duplicate/skipped rows when the count and page queries run separately.
- **`PaginationInput` / `PaginationResult` / `PaginatedMeta`** — Interfaces consumed by callers and repositories.

## Relationships

- **Imports** `environmentNumber` from `src/infrastructure/runtime/environment.ts` to read `NODE_SETTINGS_PAGINATION_PAGE_SIZE`.
- **Consumed by** module repositories and services (`orders`, `products`, `users`, `inventory`, `locales`, `feedback`) that call `normalizePagination`, `addTextFilter`/`addRegexFilter`, `buildPaginatedMeta`, and `DEFAULT_SORT` in their `search` implementations.
- **Specified by** `docs/theory/request-input.md`, which documents the `page`/`pageSize` contract these helpers implement.
- **Exercised by** `tests/cross-cutting/search-pagination.test.ts`, `search-regex.test.ts`, `search.property.test.ts`, and `src/modules/orders/tests/integration/repository.test.ts`.

## Notes

- `PaginationInput` fields are `unknown` deliberately (not `number | string | null`); repeated query keys arrive as arrays and JSON bodies can hold anything. Callers should not cast.
- `MAX_CONFIGURED_PAGE_SIZE` (100) is intentionally duplicated from `openapi.yaml`'s `PageSize.maximum` rather than imported: the schema guard rejects caller input with 422, while this guard protects against a mis-typed deployment env var that bypasses the schema entirely.
- `normalizePagination` does **not** clamp or validate caller-supplied `page`/`pageSize`; out-of-range values are the schema layer's responsibility. It only prevents structural nonsense (page < 1, NaN) that would produce an unusable `skip`.
- `toSearchPattern` returning `undefined` (not `''`) is load-bearing: `$regex: ''` matches every document, which would invert an empty search term into "return everything."
- The `_id` in `DEFAULT_SORT` is not cosmetic — without it, documents sharing a `createdAt` timestamp can appear on two pages or be skipped when the count query and page query observe different tie orders.
