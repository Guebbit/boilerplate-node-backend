---
source: tests/cross-cutting/search-pagination.test.ts
sha256: c58507ec759aa96eeaa4cd22babd1b5cbc7c84be17d28fdfdd00bb3ca28168cd
generated_at: 2026-10-15T12:40:53.463175+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/search-pagination.test.ts

## Purpose

Cross-cutting test suite for `normalizePagination`, the single authority on pagination **defaults** applied to every search query. It exists to pin down the contract that callers may pass strings, empty values, or nothing at all—and that this function (and only this function) is responsible for producing a concrete `{ page, pageSize, skip }` triple—while explicitly *not* re-enforcing the 1–100 bounds that the HTTP schema layer already rejects with 422.

## Key elements

- **`describe('normalizePagination', …)`** — the sole test block. Covers nine cases:
  - String → number coercion and `skip` derivation.
  - Default to `{ page: 1, pageSize: 10, skip: 0 }` when no arguments are given.
  - Empty-string / zero treated as "absent," not as `0`.
  - Negative `page` floored to `1` (structural guard against negative `skip`; the 422 for `?page=0` is issued upstream).
  - Caller-supplied `pageSize` is passed through untouched (no silent cap).
  - Env-provided `pageSize` *is* capped at 100, because it bypasses the request schema.
  - Env `pageSize` used as fallback when the caller omits one.
  - Explicit caller `pageSize` takes priority over the env fallback.
  - Non-numeric env `pageSize` causes `normalizePagination` to throw (catches deployment typos that slip past the boot gate).

- **`setEnvironment({ NODE_SETTINGS_PAGINATION_PAGE_SIZE })`** — imported from `@tests/environment`; injects or clears the env var before each relevant assertion.

## Relationships

- **`src/infrastructure/persistence/search.ts`** — exports `normalizePagination`, the unit under test. This file's entire assertion surface is about that one function's input/output contract.
- **`tests/support/environment.ts`** — exports `setEnvironment`, used to control `NODE_SETTINGS_PAGINATION_PAGE_SIZE` so tests can exercise the env-fallback and env-bounding paths in isolation.

## Notes

- The test file's header comment is load-bearing design documentation: `normalizePagination` is deliberately **not** a bounds enforcer. Out-of-range *request* values are rejected (422) by `@infrastructure/http/schemas`; clamping here would make that 422 unreachable and the declared `maximum: 100` in `openapi.yaml` a fiction.
- The env var is the **one** pagination source that never passes through a request schema, which is why `normalizePagination` is the last line of defense against a bad `NODE_SETTINGS_PAGINATION_PAGE_SIZE`.
- Tests that need a clean default first call `setEnvironment({ NODE_SETTINGS_PAGINATION_PAGE_SIZE: undefined })` to avoid cross-test contamination from a previously set env value.
