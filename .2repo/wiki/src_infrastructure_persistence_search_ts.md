# src/infrastructure/persistence/search.ts

## Purpose

Shared pagination, text-search sanitization, and Mongoose filter-builder helpers used by every search/paginated endpoint. Exists so that pagination defaults, regex-escaping rules, and sort conventions live in one place (OCP) rather than being re-implemented per service or repository.

## Key elements

- **`PaginationInput` / `PaginationResult` / `PaginatedMeta`** — interfaces for raw request values, normalized pagination (with derived `skip`), and the response metadata block.
- **`normalizePagination(input?)`** — coerces raw page/pageSize to numbers, applies the `NODE_SETTINGS_PAGINATION_PAGE_SIZE` default, caps the env-configured value at 100, and computes `skip`. Does **not** clamp caller-supplied out-of-range values (that is the HTTP schema's job).
- **`buildPaginatedMeta(pagination, totalItems)`** — returns `{ page, pageSize, totalItems, totalPages }` for the API response.
- **`escapeRegex(value)`** — escapes all regex metacharacters so user text is matched literally.
- **`toSearchPattern(value)`** — strips C0/DEL control characters, trims, then escapes. Returns `undefined` (not `''`) when nothing searchable remains, because `$regex: ''` matches every document.
- **`addTextFilter(where, text, fields)`** — sets `where.$or` with a case-insensitive `$regex` across multiple fields.
- **`addRegexFilter(where, field, value)`** — sets a single-field case-insensitive `$regex`.
- **`DEFAULT_SORT`** — `{ createdAt: -1, _id: -1 }`; the `_id` tiebreaker makes paging stable when concurrent inserts share a millisecond timestamp.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — provides `environmentNumber`, used to read `NODE_SETTINGS_PAGINATION_PAGE_SIZE`.
- **Service modules** (`orders`, `products`, `users`, `feedback`, `inventory`, `locales/entries`) — import the pagination and filter helpers to build their Mongoose queries.
- **`src/modules/orders/repository.ts`** — consumes the same helpers for its search implementation.
- **`src/infrastructure/persistence/create-repository.ts`** — uses `DEFAULT_SORT` and/or pagination helpers when constructing repository queries.
- **`tests/cross-cutting/search-pagination.test.ts`**, **`search-regex.test.ts`**, **`search.property.test.ts`** — unit/property tests for `normalizePagination`, `toSearchPattern`, `escapeRegex`, and the filter builders.
- **`src/modules/orders/tests/integration/repository.test.ts`** — integration test that exercises the search path end-to-end.

## Notes

- `PaginationInput` fields are typed `unknown` deliberately: repeated query keys arrive as arrays and JSON bodies can carry anything. Narrowing here would force every caller to cast.
- `MAX_CONFIGURED_PAGE_SIZE` (100) mirrors `PageSize.maximum` in `openapi.yaml` but is intentionally duplicated — a typo would otherwise silently disable paging for every search since the env var never passes through a request schema.
- `normalizePagination` treats `0`, `''`, `null`, and `NaN` identically (via `|| 0`) as "caller did not ask", which triggers the env/default fallback. An explicit caller `pageSize` still wins over the env default.
- Control-character stripping (`\u0000`–`\u001F`, `\u007F`) is separate from `escapeRegex`: NUL is not a metacharacter, and an unstripped NUL causes MongoDB to reject the pattern server-side, surfacing as a 500 on a public endpoint.
- `DEFAULT_SORT` includes `_id` for stability, not aesthetics — `search()` issues count and page as separate queries, so an unstable tie order can leak or drop documents across page boundaries.
