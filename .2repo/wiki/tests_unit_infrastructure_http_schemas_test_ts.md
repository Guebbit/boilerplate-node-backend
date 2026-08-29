# tests/unit/infrastructure/http/schemas.test.ts

## Purpose

Unit tests for the shared scalar schemas (`hardDeleteSchema`, `pageSchema`, `pageSizeSchema`, `paginationSchema`) that guarantee every endpoint interprets the same query-parameter questions identically. The file exists to lock in the contract so that a value like `?hardDelete=false` can never be misread as "delete" and a `pageSize` out of range can never be answered differently by two controllers.

## Key elements

- **`describe('hardDeleteSchema')`** — asserts `true`/`false` pass through unchanged, `undefined`/`''`/`null` resolve to `false` (soft delete), and unparseable values (`'maybe'`, `1`, `{}`) are rejected rather than coerced.
- **`describe('pageSchema / pageSizeSchema')`** — asserts string-to-number coercion, that absent values stay `undefined` (defaults are owned elsewhere), that `0`, `-1`, `'abc'`, and fractional pages are rejected, and that `pageSize` is capped at **100** (the `openapi.yaml` maximum).
- **`describe('paginationSchema')`** — asserts the combined object schema coerces both fields together and that a validation failure reports the offending field (`path: ['pageSize']`) rather than a generic error.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — the sole import source. Every `parse`/`safeParse` call in this file exercises a schema defined there; the tests are the executable specification for that module.

## Notes

- Tests assume `readInput` (the upstream request-parsing layer) has already decoded URL query strings into real booleans/strings before the schemas see them. The schemas themselves still accept string digits for page/pageSize because that path is exercised in practice.
- Absent `page`/`pageSize` values are asserted to remain `undefined`, **not** to be defaulted. Defaulting is delegated to a separate `normalizePagination` step; these schemas must not second-guess it.
- The `pageSize ≤ 100` bound is intentionally tied to the `maximum` in `openapi.yaml`. Changing one without the other is a contract bug the test is designed to catch.
- The `hardDelete` section is the most security-relevant: a schema that reads the flag as *presence* would turn `?hardDelete=false` into a destructive `true`. The explicit `false`-preservation test is the guard against that regression.
