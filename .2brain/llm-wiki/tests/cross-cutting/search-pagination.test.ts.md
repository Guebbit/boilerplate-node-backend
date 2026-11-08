---
source: tests/cross-cutting/search-pagination.test.ts
sha256: c58507ec759aa96eeaa4cd22babd1b5cbc7c84be17d28fdfdd00bb3ca28168cd
generated_at: 2026-11-08T09:31:49.059889+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/search-pagination.test.ts

## Purpose

Cross-cutting test suite for `normalizePagination`, the single authority on pagination **defaults** (page, pageSize, derived skip). It verifies that the function coerces types, applies correct fallbacks, floors page at 1, and—critically—distinguishes where defaults are set (here) from where bounds are enforced (the HTTP schema layer, which answers 422). It also guards the one path that bypasses schema validation: the `NODE_SETTINGS_PAGINATION_PAGE_SIZE` environment variable.

## Key elements

- **`describe('normalizePagination', …)`** — single top-level block; every test calls the imported `normalizePagination` directly (no HTTP, no Mongo).
- **String coercion test** — asserts `'3'`/`'25'` → numbers and `skip === (page-1)*pageSize`.
- **Default test** — no args, env unset → `{ page: 1, pageSize: 10, skip: 0 }`.
- **Empty/zero-as-absent test** — `page: ''`, `pageSize: 0` are treated the same as omitted.
- **Floor-at-1 test** — `page: -5` → `page: 1` (structural guard against a negative `skip` that Mongo cannot run; the 422 for `?page=0` is the schema's job).
- **No-cap test** — `pageSize: 5000` passes through unchanged; capping here would make the schema's 422 unreachable.
- **Env-bound test** — `NODE_SETTINGS_PAGINATION_PAGE_SIZE='5000'` is capped at 100 because the env path never hits the request schema.
- **Env-fallback test** — caller omits `pageSize` → env value (`15`) is used.
- **Explicit-over-env test** — caller supplies `pageSize: 50` → wins over env `15`.
- **Non-numeric env test** — `'not-a-number'` causes `normalizePagination()` to throw an error mentioning the variable name.

## Relationships

- **`src/infrastructure/persistence/search.ts`** — exports `normalizePagination`, the sole subject under test.
- **`tests/support/environment.ts`** — exports `setEnvironment`, used by each test to inject or clear `NODE_SETTINGS_PAGINATION_PAGE_SIZE` so env-dependent cases are isolated.

## Notes

- The suite is intentionally **unit-level**: it calls `normalizePagination` in-process and asserts on the returned object. It does not spin up an HTTP server or a Mongo instance.
- The "does not cap" and "still bounds env" tests look contradictory but encode a deliberate split: request-schema bounds (1–100) vs. the unvalidated env path. If you add a new env-backed pagination source, it will need the same bound here.
- `setEnvironment` must be called **before** each assertion in env-dependent tests; there is no per-test reset visible in this file, so tests are ordered to not depend on prior env state.
