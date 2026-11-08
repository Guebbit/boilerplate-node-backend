---
source: tests/unit/infrastructure/http/schemas.test.ts
sha256: b3bf2f986b7caa8078d7a6e3d8a9b3a12fd216764082b26843d334c9c4a009fc
generated_at: 2026-11-08T10:18:32.671614+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/schemas.test.ts

## Purpose

Unit tests for the shared contract scalars (`hardDelete`, `optionalBoolean`, `page`, `pageSize`, `pagination`) exported by `@infrastructure/http/schemas`. They lock down the single, cross-endpoint interpretation of common query parameters so that no endpoint can silently reinterpret the same input (e.g. `?hardDelete=false` must never be read as "present → true", and `pageSize=101` must always be rejected, not clamped).

## Key elements

- **`describe('hardDeleteSchema')`** — Verifies that `true`/`false` pass through, that `undefined`/`''`/`null` default to `false` (soft delete), and that unrecognisable values (`'maybe'`, `1`, `{}`) are rejected rather than coerced.
- **`describe('optionalBooleanSchema')`** — Confirms the full string vocabulary (`true/yes/1/on`, `false/no/0/off`) is decoded to a real boolean, absent values stay `undefined`, and unknown words produce a parse failure (422) instead of a silent default.
- **`describe('pageSchema / pageSizeSchema')`** — Checks string-to-number coercion, that absent values remain `undefined` (defaults are owned by `normalizePagination`, not the schema), rejection of zero/negative/non-numeric/fractional values, and the hard `pageSize ≤ 100` ceiling declared in `openapi.yaml`.
- **`describe('paginationSchema')`** — Exercises the compound `{ page, pageSize }` object schema: happy-path parsing and that an invalid member reports its specific path (`['pageSize']`) in the error issues.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Sole import target. Every `parse`/`safeParse` call in this file exercises the Zod schemas exported from that module; this test file is their executable specification.

## Notes

- Tests assume `readInput` has already run upstream, so `hardDeleteSchema` receives a real boolean (or a non-boolean), never a raw query-string token. The string-spelling logic is therefore the responsibility of `optionalBooleanSchema`, not `hardDeleteSchema`.
- The `pageSize` maximum of **100** is intentional and mirrors the `maximum` declared in `openapi.yaml`; changing one without the other would re-introduce the advertised-but-unenforced limit the file explicitly guards against.
- Absent values (`undefined`, `''`, `null`) are expected to stay `undefined` through `pageSchema`/`pageSizeSchema`. Defaulting is deliberately deferred to `normalizePagination` so there is exactly one place that decides "what does no page number mean?"
