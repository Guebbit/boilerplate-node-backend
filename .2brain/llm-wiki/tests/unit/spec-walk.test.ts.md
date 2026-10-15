---
source: tests/unit/spec-walk.test.ts
sha256: c72a2ad003dcd735b30a20c736e28ec9785162e81d372d8a2f65f282f0740015
generated_at: 2026-10-15T13:33:03.009338+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/spec-walk.test.ts

## Purpose

Unit tests that pin the two foundational pieces of the fuzz suite: the spec-walk schema resolver (`resolveSchema`, `isNullable`, `unsupportedKeywords`, `securityRequiresAuth`) and the arbitrary builder (`arbitraryFor`). They exist so that a silent regression in schema resolution (e.g. `allOf` silently collapsing, `null` in a type array being dropped) is caught here with a named cause rather than surfacing as a confusing endpoint-level failure later in the fuzz.

## Key elements

- **`specOf`** – local helper that wraps a `Record<string, SchemaNode>` into the minimal `{ paths: {}, components: { schemas } }` document shape expected by the walker.
- **`describe('resolveSchema: allOf')`** – four cases covering: scalar type + pattern surviving an `allOf` wrapper, property/required union across multiple `$ref` parts, `allOf` nested under a property, and `allOf` as the value schema of `additionalProperties`.
- **`describe('resolveSchema: null')`** – verifies that a `oneOf` of `[$ref, {type:'null'}]` is folded into the referenced node with `null` appended to its type; a genuine two-variant `oneOf` is left untouched; `isNullable` correctly classifies bare-null, type-array-with-null, plain-string, and `undefined`.
- **`describe('unsupportedKeywords')`** – asserts that a 3.0-style `nullable` keyword (cast through `SchemaNode`) is reported by `unsupportedKeywords`.
- **`describe('arbitraryFor')`** – six fast-check sampling tests confirming: nullable fields emit `null` and real values; non-nullable fields never emit `null`; bare `null` type emits only `null`; nullable enums include both `null` and members; a wrapped nullable string resolves to a scalar (not an object); `additionalProperties` objects are drawn with real keys.
- **`describe('securityRequiresAuth')`** – six table-driven cases covering absent security, empty list, optional session alongside bearer, single required scheme, two alternative schemes, and cookie-only.

## Relationships

- **`tests/support/spec-walk.ts`** (`@tests/spec-walk`) – provides `resolveSchema`, `isNullable`, `unsupportedKeywords`, `securityRequiresAuth`, and the `SchemaNode` type under test.
- **`tests/support/spec-arbitraries.ts`** (`@tests/spec-arbitraries`) – provides `arbitraryFor`, the fast-check arbitrary builder whose output is sampled and asserted in the `arbitraryFor` describe block.

## Notes

- The file deliberately uses `fc.sample` (deterministic seed by default) rather than `fc.assert` so failures are reproducible without a large property-run budget.
- The `nullable` test casts the object through `as SchemaNode`; the comment flags that `SchemaNode` intentionally has no `nullable` field—this is a 3.0 spec being fed to a 3.1 walker, and the cast is the point of the test.
- Tests are structured as flat `describe` blocks (one per function) rather than nested under a single top-level suite, so a failing test name directly names the function under test.
