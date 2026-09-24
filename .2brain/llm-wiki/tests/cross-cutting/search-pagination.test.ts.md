---
source: tests/cross-cutting/search-pagination.test.ts
sha256: 60a47cf0947a7d88d9538d5f2cdb9ee2c89a8dc0612a21320dd2fee44fe847c0
generated_at: 2026-09-23T19:59:38.282438+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/search-pagination.test.ts

## Purpose

Jest test suite for `normalizePagination`, the single authority on pagination **defaults** (page, pageSize, skip). The file exists to lock in the contract that this function decides defaults but deliberately does **not** decide bounds — out-of-range values are rejected upstream by the HTTP schema layer with a 422, and silently clamping here would make that 422 unreachable.

## Key elements

- **`describe('normalizePagination', …)`** — top-level block; sets up an `afterEach` that restores or removes `NODE_SETTINGS_PAGINATION_PAGE_SIZE` so env mutations don't leak between tests.
- **String → number coercion test** — verifies `'3'` / `'25'` become `3` / `25` and `skip` is derived as `(page − 1) × pageSize`.
- **Defaults test** — with no args and no env var, expects `{ page: 1, pageSize: 10, skip: 0 }`.
- **Empty / zero-as-absent test** — `page: ''` and `pageSize: 0` are treated as "not provided," falling back to defaults.
- **Negative-page floor test** — `page: -5` is clamped to `1` (structural guard against negative `skip` in Mongo queries; the 422 for `?page=0` still lives at the schema edge).
- **No caller-side cap test** — `pageSize: 5000` passes through unchanged; the 1–100 bound is enforced by `@infrastructure/http/schemas`, not here.
- **Env-var bound test** — `NODE_SETTINGS_PAGINATION_PAGE_SIZE = '5000'` is capped at 100 because no request schema validates an env-derived value.
- **Env fallback test** — when the caller omits `pageSize`, the env value (`15`) is used.
- **Explicit-over-env precedence test** — caller's `pageSize: 50` wins over env `15`.
- **Non-numeric env test** — `'not-a-number'` in the env var is ignored; the default `10` applies.

## Relationships

- **`src/infrastructure/persistence/search.ts`** — the module under test. The test imports `normalizePagination` directly and exercises its behavior in isolation (no HTTP layer, no Mongo connection). The file's doc comments and test names repeatedly reference `@infrastructure/http/schemas` and `openapi.yaml` as the *separate* authority on bounds, clarifying the division of responsibility between those modules and this one.

## Notes

- The file enforces a deliberate **defaults-vs-bounds split**: `normalizePagination` owns defaults and the one unvalidated path (the env var); `@infrastructure/http/schemas` owns the 1–100 range for all request-driven values. Adding a cap inside `normalizePagination` for caller-supplied values would silently swallow the 422 and make the OpenAPI `maximum` a fiction — the test explicitly asserts this is *not* done.
- The env var `NODE_SETTINGS_PAGINATION_PAGE_SIZE` is the **only** input that bypasses the request schema, which is why it gets its own cap (100) and its own set of tests (numeric parse, non-numeric fallback, precedence).
- `afterEach` handles both the "was set" and "was absent" cases for the env var; tests that depend on the env being unset must `delete` it explicitly (see the defaults and empty/zero tests).
