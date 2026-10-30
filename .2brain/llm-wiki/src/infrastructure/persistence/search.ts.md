---
source: src/infrastructure/persistence/search.ts
sha256: 11f808be14393b258b8251648546c1262376b1b82f1f35b66285488c259f7505
generated_at: 2026-10-29T02:13:58.294638+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/search.ts

## Purpose

Shared pagination, sort, and text-search helpers for Mongoose/MongoDB queries. Centralizes the logic so that new filter conventions or pagination rules change in one place rather than being duplicated across every module service (OCP).

## Key elements

- **`normalizePagination(input?)`** — Coerces raw `page`/`pageSize` (typed `unknown`) into a numeric `PaginationResult` with a derived Mongo `skip`. Falls back to the env-configured page size (capped at `MAX_CONFIGURED_PAGE_SIZE`) when the caller omits or sends a falsy value.
- **`buildPaginatedMeta(pagination, totalItems)`** — Produces a `PaginatedMeta` object (`page`, `pageSize`, `totalItems`, `totalPages`) for API response envelopes.
- **`readAll<TItem>(fetchPage, pageSize)`** — Recursively pages through `fetchPage` until a short page is returned, returning all collected items. Used where a caller needs *every* record (e.g. personal-data export) rather than a bounded page.
- **`escapeRegex(value)`** — Escapes all regex metacharacters so user text is matched literally.
- **`toSearchPattern(value)`** — Strips C0/DEL control characters, trims, escapes, and returns a safe `$regex` string — or `undefined` if nothing searchable remains.
- **`addTextFilter(where, text, fields)`** — Mutates a Mongoose filter object, adding an `$or` of case-insensitive `$regex` matches across the given fields.
- **`addRegexFilter(where, field, value)`** — Same, but for a single field.
- **`DEFAULT_SORT`** — `{ createdAt: -1, _id: -1 }`; newest-first with `_id` tiebreaker for stable pagination.
- **`withTiebreaker(sort)`** — Appends `_id: -1` to a sort object that doesn't already include it, ensuring a total order for `skip`-based paging.
- **`SORT_COLLATION`** — `{ locale: 'en', strength: 2 }` for accent-tolerant, case-insensitive ordering.
- **`resolveSort(tokens, sortable)`** — Converts wire-format sort tokens (`"field"`, `"-field"`) into a Mongoose sort object via a per-collection whitelist; drops unknown fields; always closes with `_id`.
- **`sortOf(filters, sortable)`** — Convenience wrapper that reads the `sort` key from an untyped filter bag and delegates to `resolveSort`.
- **`MAX_CONFIGURED_PAGE_SIZE`** (100) — Hard ceiling on the env-configured page size; exported so `readAll` callers can loop with the same bound.

## Relationships

- **Imports** `persistenceConfig` from `src/infrastructure/persistence/config.ts` to read `NODE_SETTINGS_PAGINATION_PAGE_SIZE` as the default page size.
- **Consumed by** the module services and repositories listed in the dependency graph (`api-keys`, `delivery/board`, `example/crud`, `example/personal-data`, `inventory/levels`, `locales/entries`, `orders/repository`, `orders/services/*`, `payments/repository`, `payments/services/list`) — they call `normalizePagination`, `addTextFilter`/`addRegexFilter`, `resolveSort`/`sortOf`, `buildPaginatedMeta`, and `readAll` when building their Mongoose queries.
- **Tested** by `src/modules/orders/tests/integration/repository.test.ts` (and likely analogous integration tests in other modules) to verify pagination, sort, and filter behaviour end-to-end.

## Notes

- `PaginationInput` fields are typed `unknown` (not `number | string | null`) because a repeated query key arrives as an array and a JSON body can hold anything; the coercion inside `normalizePagination` handles it, and a narrower type would force callers to cast.
- `toSearchPattern` returns `undefined` (not `''`) when the input vanishes after stripping — an empty `$regex` pattern matches *every* document, which would invert a "no filter" into "match all."
- `escapeRegex` does **not** strip NUL bytes; that is handled by the `CONTROL_CHARACTERS` regex inside `toSearchPattern`. A NUL in a `$regex` pattern causes MongoDB to reject the query (C-string compilation), surfacing as a 500 on a public endpoint.
- `resolveSort` uses `Object.hasOwn` to guard against prototype-chain tokens like `"constructor"`.
- `DEFAULT_SORT` includes `_id` because `createdAt` is not unique (concurrent creates in the same millisecond) and the count + page queries are issued separately; without the tiebreaker a page boundary inside a tie can duplicate or skip rows.
- `MAX_CONFIGURED_PAGE_SIZE` intentionally mirrors the `PageSize.maximum` in `openapi.yaml` but is **not** imported from it — the edge schema rejects out-of-range values with 422, while this constant only guards the *default* path and `readAll`'s loop bound.
- `readAll` pushes into a single array rather than spreading on each page, avoiding a quadratic copy cost across many pages.
