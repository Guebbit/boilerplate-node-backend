---
source: tests/cross-cutting/search-regex.test.ts
sha256: 60463dee2bd8a528f1d9ee6e7467ddd61f66f4a7d80ba9cf981c25ca54f64e9b
generated_at: 2026-11-08T09:32:02.193577+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/search-regex.test.ts

## Purpose

Cross-cutting test suite that verifies the regex-escaping and MongoDB `$regex` filter helpers in `search.ts` are safe against user-supplied input on public, unauthenticated endpoints (`POST /products/search`, `GET /products?text=`). It guards two failure modes: catastrophic-backtracking DoS via unescaped metacharacters, and 500 errors from control characters (notably NUL) that MongoDB's C-string pattern compiler rejects.

## Key elements

- **`escapeRegex` describe block** — parameterised over `METACHARACTERS` (15 characters); asserts each is escaped, ordinary text is untouched, the classic `(a+)+$` ReDoS payload is rendered inert (structural assertion, not a stopwatch), and the result matches the literal string the user typed.
- **`the filters that reach MongoDB` describe block** — calls `addTextFilter` and `addRegexFilter` with malicious / normal / empty inputs; verifies the `$regex` values they write into a `where` object are escaped, and that `undefined | null | '' | '   '` produce an empty `where` (no filter added).
- **`control characters` describe block** — exercises `toSearchPattern` with NUL, bell, backspace, ESC, and DEL. Confirms NUL is stripped while surrounding text is preserved, that a term consisting *only* of a control character yields `undefined` (not `''`, which would match all documents), that both filter helpers drop the filter entirely in that case, and that the strip-then-escape composition still works.
- **`METACHARACTERS`** — module-level constant listing the 15 regex metacharacters; drives the `it.each` parameterised cases.

## Relationships

- **`src/infrastructure/persistence/search.ts`** — the sole import target. This file tests the four exported functions (`addRegexFilter`, `addTextFilter`, `escapeRegex`, `toSearchPattern`) by calling them with crafted inputs and inspecting the resulting regex strings or `where` objects. It does not import any other module.
- **`search.property.test.ts`** (referenced in a comment, not imported) — the property-based companion that generates arbitrary inputs to cover the general "escapes whatever it is given" claim. This file handles the named, memorable edge cases; that file handles the universal quantification.

## Notes

- **No timing assertions for ReDoS.** The `(a+)+$` test asserts the *structure* of the escaped output (every metachar is backslash-prefixed) rather than a wall-clock threshold, because CI load would make a time-based assertion flaky.
- **`undefined` vs `''` for blank input.** `toSearchPattern` returns `undefined` (not an empty string) when the term reduces to nothing. This is deliberate: `$regex: ''` matches *every* document, so an empty string would invert the filter's intent.
- **NUL stripping is a separate step from escaping.** NUL is not a metacharacter; it is a byte the pattern language cannot encode. That is why `escapeRegex` does not handle it and `toSearchPattern` strips it before escaping. The two steps compose: strip-then-escape.
- **Origin of the NUL cases.** Discovered by `test:fuzz` with seed `108919307`; reproduced across `tag`, `category`, and `text` fields.
