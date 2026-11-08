---
source: tests/support/body-of.ts
sha256: 59b19673fe99c84ba7bd68cf08685626e4d61f8973baa887ccf0a720a750c1ff
generated_at: 2026-11-08T09:51:31.755183+00:00
model: ollama:qwen3.8:27b
---

# tests/support/body-of.ts

## Purpose
A test-support helper for integration journeys. `bodyOf` asserts that a supertest response carries the HTTP status encoded in the schema's name, then parses the body through that schema and returns the result typed from it. This lets a journey read a response field with full compile-time safety: if the contract doesn't declare the field, the journey won't compile.

## Key elements
- **`bodyOf(response, schema)`** – The sole export. Looks up the expected status from the schema via `STATUS_BY_SCHEMA`, throws if the schema isn't a per-status response schema or the status differs, then returns `schema.parse(response.body)` typed as `zod.infer<TSchema>`.
- **`STATUS_BY_SCHEMA`** – A `ReadonlyMap<unknown, number>` built at module load by scanning every export in `@api/schemas.zod` and extracting the trailing three-digit number from each name (e.g. `Login200Response` → 200). Schemas whose names don't match the `(\d{3})Response$` pattern are silently skipped.

## Relationships
- **Integration journey tests** (e.g. `bought-returned-refunded.test.ts`, `the-hold-that-was-never-paid.test.ts`, `quiet-for-three-years.test.ts`, and the others) import `bodyOf` to assert and decode each step's response in their happy- and error-path assertions.
- **`tests/unit/support/body-of.test.ts`** – Unit tests that exercise `bodyOf`'s own behavior (correct parse, status-mismatch error, non-schema rejection).
- **`tests/support/altcha.ts` / `tests/support/journey-orders.ts`** – Sibling support modules in the same test-support directory; no direct import between them and this file is visible.

## Notes
- The status-to-schema mapping is purely name-convention-based. A schema exported from `@api/schemas.zod` that doesn't end in `<digits>Response` will not be found, and passing it to `bodyOf` throws. If the API package adds a response schema under a different naming pattern, this file must be updated.
- The map is keyed by the schema **object reference**, not by name. Re-importing the same schema module should yield the same reference (standard ESM behavior), but bundler quirks that duplicate the module could cause a lookup miss.
- Error messages include the JSON-serialized body on status mismatch, which is useful for debugging but can be verbose for large payloads.
