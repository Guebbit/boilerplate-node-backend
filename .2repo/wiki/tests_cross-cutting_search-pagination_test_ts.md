# tests/cross-cutting/search-pagination.test.ts

## Purpose

Cross-cutting test suite for `normalizePagination`, the single authority on pagination **defaults** for every search query. It verifies the coercion, defaulting, and env-fallback behavior that runs after the request layer and before the query is built, and it explicitly documents what the function does *not* do (i.e., enforce bounds—that belongs to the HTTP schema layer).

## Key elements

- **`describe('normalizePagination', …)`** — top-level block; restores `NODE_SETTINGS_PAGINATION_PAGE_SIZE` in `afterEach`.
- **Coercion & `skip` derivation** — asserts that string inputs (`'3'`, `'25'`) become numbers and that `skip` is computed as `(page − 1) × pageSize`.
- **Default fallback** — with no arguments and no env var, returns `{ page: 1, pageSize: 10, skip: 0 }`.
- **Empty/zero-as-absent** — `page: ''` and `pageSize: 0` are treated as "not provided," not as literal zero.
- **Floor at page 1** — a negative `page` is clamped to 1 (structural guard against a negative `skip` in Mongo); the 422 for `?page=0` is issued by the schema, not here.
- **No caller-side cap** — `pageSize: 5000` passes through unchanged; capping here would make the schema's 422 unreachable.
- **Env page-size bound (max 100)** — `NODE_SETTINGS_PAGINATION_PAGE_SIZE='5000'` is capped to 100 because no request schema validates an env value.
- **Env fallback & precedence** — env value is used only when the caller omits `pageSize`; an explicit caller value always wins.
- **Non-numeric env rejection** — `'not-a-number'` in the env falls back to the hard default of 10.

## Relationships

- **`src/infrastructure/persistence/search.ts`** — the sole import; provides `normalizePagination`, the function under test. Every assertion exercises that single export.
- **`@infrastructure/http/schemas`** (referenced in comments, not imported) — the complementary layer that enforces the 1–100 `pageSize` / `page ≥ 1` bounds and answers 422. This test file's "does not cap" case exists precisely because that schema is the enforcement point.

## Notes

- The file is intentionally a **defaults + safety** spec, not a bounds spec. If you add clamping logic to `normalizePagination`, the "does not cap a page size the caller asked for" test will fail by design—bounds are the schema's contract.
- The env variable (`NODE_SETTINGS_PAGINATION_PAGE_SIZE`) is the *one* input path that bypasses request-schema validation, which is why `normalizePagination` still applies a max-100 cap to it. This asymmetry is deliberate and tested.
- The `afterEach` restore logic handles both "var was set" and "var was absent" cases; new tests that set the env var must not remove or overwrite this teardown.
