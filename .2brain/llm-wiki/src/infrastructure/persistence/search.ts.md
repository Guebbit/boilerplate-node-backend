---
source: src/infrastructure/persistence/search.ts
sha256: 11f808be14393b258b8251648546c1262376b1b82f1f35b66285488c259f7505
generated_at: 2026-11-08T03:44:42.776101+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/search.ts

## Purpose

Shared pagination, text-search, and sort helpers for Mongoose-based repositories. Extracted into one module so that new filter conventions (page-size caps, regex safety, tie-broken ordering) are defined once and reused across every service that searches, satisfying OCP.

## Key elements

- **`normalizePagination`** — Coerces raw request values (`unknown`) into a `{ page, pageSize, skip }` tuple. Applies a 1-based floor, falls back to `persistenceConfig().NODE_SETTINGS_PAGINATION_PAGE_SIZE` (capped at 100), and derives `skip`.
- **`buildPaginatedMeta`** — Produces the `{ page, pageSize, totalItems, totalPages }` envelope returned alongside a result page.
- **`readAll`** — Recursively calls `fetchPage(n)` until a short page arrives, concatenating all items. Used by personal-data (Art. 15) exports that must never truncate.
- **`escapeRegex` / `toSearchPattern`** — Escapes regex metacharacters and strips C0/DEL control characters. Returns `undefined` (not `''`) when nothing searchable remains, because `$regex: ''` would match every document.
- **`addTextFilter` / `addRegexFilter`** — Mutate a Mongoose filter object with case-insensitive `$regex` across one or many fields.
- **`DEFAULT_SORT` / `withTiebreaker`** — Guarantee a total ordering by appending `_id: -1`, preventing duplicate/missing rows at page boundaries when `createdAt` ties.
- **`SORT_COLLATION`** — `{ locale: 'en', strength: 2 }` for case- and accent-tolerant sort.
- **`resolveSort` / `sortOf`** — Parse wire-level sort tokens (`-field` for desc) through a per-collection whitelist (`Object.hasOwn` guards against prototype keys) and close the order with `_id`.

## Relationships

- **`src/infrastructure/persistence/config.ts`** — Sole import: reads `persistenceConfig().NODE_SETTINGS_PAGINATION_PAGE_SIZE` as the default page size.
- **`src/infrastructure/persistence/create-repository.ts`** — Consumes the search/sort helpers when building repository query functions.
- **Module services** (`orders/repository.ts`, `orders/services/read.ts`, `orders/services/actions.ts`, `payments/repository.ts`, `payments/services/list.ts`, `inventory/services/levels.ts`, `locales/services/entries.ts`, `api-keys/services/api-keys.ts`, `delivery/services/board.ts`, `example/services/crud.ts`, `example/services/personal-data.ts`) — All import the pagination, filter, and sort helpers to build their Mongoose queries without re-implementing the logic.
- **`src/modules/orders/tests/integration/repository.test.ts`** — Exercises the pagination/sort paths end-to-end.

## Notes

- `toSearchPattern` returning `undefined` is load-bearing: an empty string in `$regex` matches **every** document, inverting the filter.
- `escapeRegex` handles metacharacters only; NUL (`\u0000`) is stripped separately by the `CONTROL_CHARACTERS` regex in `toSearchPattern`. Skipping that step causes a server-side 500 on a public endpoint.
- `MAX_CONFIGURED_PAGE_SIZE` (100) is deliberately duplicated from `openapi.yaml` rather than imported — a typo in the env var would otherwise silently disable paging, while the OpenAPI edge already 422s out-of-range values.
- `readAll` pushes into a single array instead of spreading per page, avoiding O(n²) copies across many pages.
- `resolveSort` uses `Object.hasOwn` (not `in`) so a token like `"constructor"` cannot resolve through the prototype chain.
