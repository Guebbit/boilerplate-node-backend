---
source: src/infrastructure/persistence/search.ts
sha256: d17664dfede110a691700494a2d29c8d231307cc2d9e13b40adfaacc01a66ae7
generated_at: 2026-10-14T08:11:38.111464+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/search.ts

## Purpose

Shared pagination, search-pattern, and sort helpers for all Mongoose-backed repositories. Extracted so that filter conventions (regex escaping, control-character stripping, pagination defaults, stable sort) live in one place, satisfying OCP: a new search or sort rule changes here once rather than in every module's service.

## Key elements

- **`PaginationInput` / `PaginationResult` / `PaginatedMeta`** — interfaces for raw request pagination, the normalised `{ page, pageSize, skip }` triple, and the response meta block.
- **`MAX_CONFIGURED_PAGE_SIZE`** (100) — ceiling for the deployment-configured default page size; mirrors `openapi.yaml` `PageSize.maximum`.
- **`normalizePagination(input?)`** — coerces raw `page`/`pageSize` (typed `unknown`) into a numeric, defaulted result with a derived Mongo `skip`. Does **not** clamp out-of-range values (the HTTP schema does that with a 422).
- **`buildPaginatedMeta(pagination, totalItems)`** — computes `totalPages` from a total count for the response envelope.
- **`readAll<TItem>(fetchPage, pageSize)`** — iterates pages until `fetchPage` returns fewer than `pageSize` items; returns every item. Used by personal-data exports where a truncated result would be misleading.
- **`escapeRegex(value)`** — escapes all regex metacharacters so user text is matched literally (prevents regex DoS on public endpoints).
- **`toSearchPattern(value)`** — strips C0/DEL control characters, trims, escapes; returns `undefined` when nothing searchable remains (an empty `$regex` would match *every* document).
- **`addTextFilter(where, text, fields)`** — sets `where.$or` with a case-insensitive `$regex` across the given fields.
- **`addRegexFilter(where, field, value)`** — same, for a single field.
- **`DEFAULT_SORT`** — `{ createdAt: -1, _id: -1 }`; `_id` breaks ties for stable pagination.
- **`SORT_COLLATION`** — `{ locale: 'en', strength: 2 }` for case-insensitive, accent-tolerant ordering.
- **`resolveSort(tokens, sortable)`** — maps wire-field tokens (`-` prefix = desc) through a per-collection whitelist, drops unknown fields, appends `_id: -1` for stability. Returns `undefined` when no token survives.
- **`sortOf(filters, sortable)`** — convenience wrapper that reads `.sort` off an untyped filter bag and delegates to `resolveSort`.

## Relationships

- **`src/infrastructure/persistence/config.ts`** — imports `persistenceConfig` to read `NODE_SETTINGS_PAGINATION_PAGE_SIZE` (the default page-size fallback in `normalizePagination`).
- **`src/infrastructure/persistence/create-repository.ts`** — the generic repository factory that wires these helpers into concrete repository implementations.
- **Module repositories & services** (orders, payments, api-keys, delivery/board, feedback, inventory/levels, locales/entries, example/crud, example/personal-data) — each calls `normalizePagination`, `buildPaginatedMeta`, `addTextFilter` / `addRegexFilter`, `resolveSort` / `sortOf`, and `DEFAULT_SORT` / `SORT_COLLATION` when building Mongo queries.
- **`src/modules/orders/tests/integration/repository.test.ts`** — integration tests that exercise the pagination and sort behaviour end-to-end.

## Notes

- `normalizePagination` intentionally does **not** clamp `pageSize`; out-of-range values are rejected at the HTTP edge. Clamping here would advertise a limit the API never actually enforces.
- `toSearchPattern` returns `undefined` (not `''`) when the cleaned value is empty — `$regex: ''` matches every document in MongoDB, which would invert the filter.
- `escapeRegex` covers metacharacters only; the separate `CONTROL_CHARACTERS` regex strips `\u0000`–`\u001F` and `\u007F`. A NUL byte causes MongoDB to reject the pattern server-side (500 on a public endpoint); it is not a metacharacter, so `escapeRegex` never catches it.
- `resolveSort` uses `Object.hasOwn` to prevent prototype-chain lookup (a token like `constructor` must not resolve).
- `DEFAULT_SORT` includes `_id: -1` because `createdAt` is not unique (concurrent creates share a millisecond) and MongoDB does not guarantee stable ordering of ties between the separate count and page queries.
- `MAX_CONFIGURED_PAGE_SIZE` is deliberately repeated rather than imported from the OpenAPI spec: the env-var path never passes through a request schema, so a typo would silently disable paging rather than surface a 422.
