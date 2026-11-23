---
source: src/infrastructure/persistence/search.ts
source_sha256: 799f938f7575e06005d3cb1fe350ead977d1a8ec2c3399ed5b4768de03be0da4
context_sha256: f42c1ee146078665fd374df623cde90d097a22cfc85ebd11bc816a4cc6a12376
generated_at: 2026-11-22T03:04:36.911135+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/search.ts

## Purpose
Shared pagination, text-search, and sort helpers for MongoDB/Mongoose-backed repositories and services. It centralizes filter and paging conventions so a change happens in one place rather than in every service. It also keeps user-supplied search text safe to use in `$regex`.

## Key elements
- **`PaginationInput` / `PaginationResult` / `PaginatedMeta`**: types for raw page/size input, the normalized result (`page`, `pageSize`, `skip`), and the response meta (`page`, `pageSize`, `totalItems`, `totalPages`).
- **`MAX_CONFIGURED_PAGE_SIZE`** (100): ceiling applied to the deployment-configured default page size. It mirrors `PageSize.maximum` in `openapi.yaml` and is exported for `readAll` callers.
- **`normalizePagination(input)`**: coerces `page` (minimum 1) and `pageSize` and derives `skip`. A missing or invalid `pageSize` falls back to `min(100, NODE_SETTINGS_PAGINATION_PAGE_SIZE)`. An explicit caller `pageSize` is not clamped.
- **`buildPaginatedMeta(pagination, totalItems)`**: builds the meta object with `totalPages = ceil(totalItems / pageSize)`.
- **`readAll(fetchPage, pageSize)`**: fetches pages 1, 2, … until a page returns fewer than `pageSize` items, then returns all items in one array. It exists for complete exports such as personal-data (Art. 15) answers.
- **`escapeRegex(value)`**: escapes regex metacharacters so text matches literally.
- **`toSearchPattern(value)`**: accepts a string or number, strips C0 control characters and DEL, trims, and escapes the result. It returns `undefined` if nothing searchable remains.
- **`addTextFilter(where, text, fields)`**: sets `where.$or` to case-insensitive `$regex` clauses across the given fields. It does nothing if the pattern is `undefined`.
- **`addRegexFilter(where, field, value)`**: sets a single-field case-insensitive `$regex` filter. It does nothing if the pattern is `undefined`.
- **`DEFAULT_SORT`**: `{ createdAt: -1, _id: -1 }`.
- **`withTiebreaker(sort)`**: appends `_id: -1` unless the sort already names `_id`.
- **`SORT_COLLATION`**: `{ locale: 'en', strength: 2 }`, for case-insensitive, accent-tolerant ordering of caller-chosen sorts.
- **`resolveSort(tokens, sortable)`**: converts `sort` tokens (a `-` prefix means descending) into a Mongo sort through a wire-field → Mongo-path whitelist. It returns `undefined` if no token survives.
- **`sortOf(filters, sortable)`**: reads `filters.sort` from an untyped filter bag and passes it to `resolveSort`.

## Relationships
- **`config.ts`**: `normalizePagination` calls `persistenceConfig()` to read `NODE_SETTINGS_PAGINATION_PAGE_SIZE`.
- **Consumers**: the other neighbors (`create-repository.ts`, the orders and payments repositories, and the service files under api-keys, delivery, example, inventory, locales, and orders) use these helpers for paging, filtering, and sorting. The orders repository integration test also exercises them. The file itself imports only `config.ts`.
- **`readAll` callers**: `MAX_CONFIGURED_PAGE_SIZE` is exported so they can use the same ceiling as their page size.

## Notes
- **Regex safety**: unescaped `$regex` is a denial-of-service risk on public search endpoints. A NUL character in a pattern makes MongoDB reject it, which surfaces as a 500. That is why `toSearchPattern` strips control characters, and why it returns `undefined` rather than an empty pattern (`$regex: ''` matches everything).
- **No clamping of caller values**: `normalizePagination` does not bound a caller's `pageSize`. Out-of-range values are rejected with a 422 at the HTTP schema layer, per `openapi.yaml`. Only structural guards (page below 1, non-numeric input) apply here.
- **Stable paging**: `createdAt` is not unique, so every sort that uses `skip` must end in `_id` (`DEFAULT_SORT`, `withTiebreaker`, and `resolveSort` all do). Otherwise tied rows can repeat or vanish across pages.
- **`readAll` assumes a fixed `pageSize`**: it treats a short page as the last one.
- **`resolveSort`**: it uses `Object.hasOwn`, so tokens like `constructor` cannot resolve through the prototype. The first mention of a field wins, and non-string tokens are ignored.
