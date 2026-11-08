---
source: tests/unit/scripts/contracts/extends-map.test.ts
sha256: 01b44af41fc1cfdff1a356833c71447a4183b2e98f56ddf6abf463d2f9315c6e
generated_at: 2026-11-08T10:32:53.041580+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/extends-map.test.ts

## Purpose

Unit tests for the `extends-map` contract module, which provides the single shared interpretation of a fragment's `x-extends` property used by both the OpenAPI and AsyncAPI bundlers. The tests verify that the two exported helpers (`parseExtendsMap`, `requireDeclared`) accept well-formed input and reject malformed input with specific, stable error messages.

## Key elements

- **`describe('parseExtendsMap')`** — Verifies that a valid `{ name: string[] }` map passes through unchanged, and that seven invalid shapes (scalar, list, `null`, non-list value, non-string entries, empty list, repeated entry) each throw a distinct regex-matched error.
- **`describe('requireDeclared')`** — Confirms that every variant name in the provided list must appear as a key in the declared object; the first missing name triggers a `"variant X is not declared"` error.
- **`'frag'`** — A constant fragment-name string passed to both functions purely to appear in error messages; it is not a real fragment reference.

## Relationships

- **`scripts/contracts/extends-map.ts`** — The sole production dependency. The test imports `parseExtendsMap` and `requireDeclared` directly from it; no other modules are touched.

## Notes

- Tests are driven with **plain literal values** (per the file header comment), so no mocking of bundler state or fragment objects is required.
- The `it.each` table in `parseExtendsMap` doubles as the authoritative list of rejected shapes; if a new rejection case is added to the source, a corresponding row should appear here.
- Error assertions use **regex matchers** (`/…/`), not exact strings, so message wording can change as long as the key phrases are preserved.
