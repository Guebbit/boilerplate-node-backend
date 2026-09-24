---
source: tests/unit/infrastructure/http/schemas.test.ts
sha256: b3bf2f986b7caa8078d7a6e3d8a9b3a12fd216764082b26843d334c9c4a009fc
generated_at: 2026-09-23T20:23:33.164249+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/schemas.test.ts

## Purpose

Unit tests for the shared scalar schemas in `@infrastructure/http/schemas`. Each schema exists to guarantee that the same query-string input yields one consistent answer across every endpoint—preventing divergence where, for example, `?hardDelete=false` could be read as "present → true" on one route and "explicitly false" on another.

## Key elements

- **`describe('hardDeleteSchema')`** — Verifies that explicit `false` is preserved (not treated as "absent → soft delete"), that absent values (`undefined`, `''`, `null`) default to `false`, and that uninterpretable values (`'maybe'`, `1`, `{}`) are _rejected_ rather than silently coerced to the destructive `true`.
- **`describe('optionalBooleanSchema')`** — Asserts the full truthy/falsy vocabulary (`'true'/'yes'/'1'/'on'` and `'false'/'no'/'0'/'off'`) decodes correctly, absent values stay `undefined`, and unrecognized strings produce a `safeParse` failure.
- **`describe('pageSchema / pageSizeSchema')`** — Confirms string-to-integer coercion, that absent values remain `undefined` (defaults are `normalizePagination`'s responsibility, not the schema's), rejection of `0`, negatives, fractional numbers, and non-numeric strings, and enforcement of the `pageSize` maximum of 100.
- **`describe('paginationSchema')`** — Tests the combined object (`{ page, pageSize }`), and that a `safeParse` failure reports the specific offending key via `error.issues[0].path`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — The sole import target. This test file exercises every exported schema from that module; it has no other dependencies.

## Notes

- These schemas are expected to run _after_ `readInput` has already decoded raw query-string spellings; the test comments make this contract explicit.
- The `pageSize` cap of 100 is sourced from `openapi.yaml` (`maximum: 100`), not from a constant in the schema module itself.
- Default values for `page`/`pageSize` are intentionally **not** set here—`normalizePagination` is the single authority on defaults, and the schemas leave absent fields as `undefined` so it can apply them without a second source of truth.
- The rejection-over-coercion philosophy is tested throughout: any value the schema cannot confidently interpret must fail (`safeParse.success === false`), never silently become a destructive or default behavior.
