---
source: tests/unit/support/spec-walk.test.ts
sha256: c72a2ad003dcd735b30a20c736e28ec9785162e81d372d8a2f65f282f0740015
generated_at: 2026-11-08T10:44:49.883416+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/spec-walk.test.ts

## Purpose

Unit tests that pin the two foundational pieces of the fuzz suite — `resolveSchema` (spec-walk) and `arbitraryFor` (arbitrary builder) — against purpose-built schemas. If `allOf` merging or `null`-in-type-array handling silently regressed, the fuzz suite would stay green while generating no useful traffic; these tests name the cause at the unit level instead of at an endpoint.

## Key elements

- **`specOf(schemas)`** — local helper that wraps a record of `SchemaNode`s in a minimal OpenAPI document shape (`{ paths: {}, components: { schemas } }`).
- **`describe('resolveSchema: allOf')`** — verifies that `allOf` merges scalar type + pattern from a `$ref`, unions `properties`/`required` across multiple parts, resolves `allOf` nested under a property key, and resolves `allOf` inside `additionalProperties`.
- **`describe('resolveSchema: null')`** — verifies that `oneOf: [$ref, {type:'null'}]` collapses into the referenced node with `null` added to its type array; confirms a two-variant `oneOf` is left untouched; table-tests `isNullable` across bare-null, type-array-with-null, plain-type, and `undefined`.
- **`describe('unsupportedKeywords')`** — asserts that a 3.0-style `nullable` keyword (absent from the 3.1 `SchemaNode` type, hence the cast) is detected and returned.
- **`describe('arbitraryFor')`** — samples the generated `fc.Arbitrary` (20–400 draws) and asserts: nullable fields yield `null` *and* valid values; non-nullable fields never yield `null`; bare-null yields only `null`; nullable enums include both `null` and members; a resolved wrapped-nullable string produces strings or null (never objects); `additionalProperties` maps produce non-empty objects.
- **`describe('securityRequiresAuth')`** — table-tests `securityRequiresAuth` against absent, empty, optional, single-scheme, multi-scheme, and cookie-only `security` arrays.

## Relationships

- **`tests/support/spec-walk.ts`** — the module under test. Imports `resolveSchema`, `isNullable`, `unsupportedKeywords`, `securityRequiresAuth`, and the `SchemaNode` type.
- **`tests/support/spec-arbitraries.ts`** — the arbitrary builder under test. Imports `arbitraryFor`, which consumes the resolved schemas produced by the spec-walk module above.

## Notes

- The `unsupportedKeywords` test deliberately casts a 3.0 `nullable` property into `SchemaNode` to exercise a code path the TypeScript types no longer allow — removing the cast would make the test a no-op.
- `arbitraryFor` tests use `fc.sample` with fixed draw counts (20–400) and assert on the *presence* of expected values rather than `fc.assert` property loops; they are existence checks, not exhaustive invariants.
- The file's own doc comment states the design rationale: these tests exist so a regression is caught here with a descriptive name rather than surfacing (or not surfacing) as a vague endpoint-level fuzz failure.
