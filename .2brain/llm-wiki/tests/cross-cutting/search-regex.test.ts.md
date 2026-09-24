---
source: tests/cross-cutting/search-regex.test.ts
sha256: 60463dee2bd8a528f1d9ee6e7467ddd61f66f4a7d80ba9cf981c25ca54f64e9b
generated_at: 2026-09-23T19:59:48.665897+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/search-regex.test.ts

## Purpose

Cross-cutting tests for the user-text → MongoDB `$regex` pipeline. It verifies that arbitrary client input (unescaped metacharacters, catastrophic backtracking patterns, NUL/control bytes) is safely transformed into a pattern that matches the literal text only, without 500-ing a public endpoint or silently matching every document.

## Key elements

- **`METACHARACTERS`** – array of the 14 regex metacharacters; drives a parameterized `it.each` that asserts `escapeRegex` neutralises each one individually.
- **`describe('escapeRegex')`** – unit tests for `escapeRegex`: per-metacharacter escaping, passthrough of plain text, structural verification that `(a+)+$` becomes `\(a\+\)\+\$`, and round-trip matching of literal strings like `"50% (off)"`.
- **`describe('the filters that reach MongoDB')`** – integration-style tests for `addTextFilter` and `addRegexFilter`: confirms the built `where` object contains escaped `$regex` values, and that `undefined`/`null`/empty/whitespace input produces no filter clause at all.
- **`describe('control characters')`** – tests for `toSearchPattern`: NUL stripping (preserving surrounding text), control-only input returning `undefined` rather than `''`, and composition of strip-then-escape for mixed input.

## Relationships

- **`src/infrastructure/persistence/search.ts`** – sole import source; provides `escapeRegex`, `addTextFilter`, `addRegexFilter`, and `toSearchPattern`. Every assertion in this file exercises one of those four functions.
- **`search.property.test.ts`** (referenced in a comment, not imported) – owns the general "escapes arbitrary input" property; this file intentionally limits itself to named, memorable examples.

## Notes

- The catastrophic-backtracking test asserts the **exact escaped string** rather than a wall-clock threshold, so it cannot flake on a loaded CI runner.
- `toSearchPattern` returns `undefined` (not `''`) when the result is empty; `$regex: ''` would match every document, inverting the filter.
- NUL is handled by a separate strip step in `toSearchPattern`, not by adding `\0` to the escape list — it is a byte the C-string pattern compiler rejects, not a metacharacter.
- The file is tagged `cross-cutting`, meaning it tests the _pipeline_ (strip → escape → build filter) rather than each function in isolation; individual-function contracts live elsewhere.
