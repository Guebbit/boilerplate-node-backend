---
source: tests/unit/scripts/contracts/fill-enum.test.ts
sha256: ca3276efd6bde871a7a7b213f38f4d881984b423eba5734743eb8bbecbff845e
generated_at: 2026-11-08T10:33:03.162404+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/fill-enum.test.ts

## Purpose

Unit tests for `withFilledEnums`, the post-bundle step that resolves `x-enum-from` placeholders by splicing in an external source list. The suite drives the function with a minimal hand-built OpenAPI document so the property under test is the fill rule and its refusal paths, not the webhook-event schemas that happen to use it in production.

## Key elements

- **`SOURCES`** – Test fixture: `{ colours: ['red','green'], none: [] }`, the only two source maps handed to the function.
- **`bundle(schema)`** – Wraps a single schema object into a minimal `OpenApiDocument` with two components: `Colour` (top-level) and `Holder` (the same schema nested under a property, via `structuredClone`).
- **`filled(document)`** – Convenience that calls `withFilledEnums(document, SOURCES)` in place and returns `document.components?.schemas`.
- **`describe('withFilledEnums')`** – Covers:
  - Happy path: writes source into `enum`, removes `x-enum-from`/`x-enum-also` markers, works at top-level and nested positions.
  - `x-enum-also` appends extra values after the source list.
  - Pre-existing hand-written `enum` values are kept first, source appended after.
  - "Own-name" exception: a component schema referencing itself by name is allowed to skip the source; the same reference on an inline (non-component) schema is rejected.
  - No-placeholder document passes through untouched.
  - A table of six refusal cases (unknown source, empty source, duplicate values, non-string enums, non-string appends) each expecting a specific error message.

## Relationships

- **`scripts/contracts/fill-enum.ts`** – Provides `withFilledEnums`, the sole function under test.
- **`scripts/contracts/openapi-document.ts`** – Provides the `OpenApiDocument` type used to shape the test fixtures and `asStub` casts.
- **`tests/support/stub.ts`** – Provides `asStub`, a type-level escape hatch that lets the test objects satisfy `OpenApiDocument` without implementing every optional field.

## Notes

- `bundle` uses `structuredClone(schema)` for the nested `Holder.properties.colour` so that mutations in one component don't silently leak into the other.
- Tests are deliberately independent of any real webhook-event schema; the file's doc comment makes this isolation intent explicit.
- Refusal tests assert on error-message *regex fragments* rather than exact strings, so wording can change without breaking the suite as long as the key phrase survives.
