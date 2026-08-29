# tests/cross-cutting/search-regex.test.ts

## Purpose

Verifies that user-supplied search text is safe to pass into MongoDB `$regex` on the public, unauthenticated endpoints (`POST /products/search`, `GET /products?text=`). Covers two failure modes the module under test must neutralise: catastrophic-backtracking ReDoS via unescaped metacharacters, and server-500s from bytes (NUL, control chars) that MongoDB's C-string pattern compiler rejects.

## Key elements

- **`METACHARACTERS`** – the 14 regex metacharacters used to drive the per-character escape assertion in the `escapeRegex` suite.
- **`describe('escapeRegex')`** – asserts each metacharacter is backslash-escaped, plain text passes through unchanged, the classic `(a+)+$` ReDoS payload becomes a fully-quoted literal, and the result still matches the user's original string.
- **`describe('the filters that reach MongoDB')`** – confirms `addTextFilter` and `addRegexFilter` escape before writing `$regex`, and that empty/whitespace/`null`/`undefined` inputs produce no clause at all (no match-all, no match-nothing).
- **`describe('control characters')`** – exercises `toSearchPattern` with NUL and other C0/C1 control bytes: NUL is stripped while surrounding text is kept; a term consisting solely of a control char yields `undefined` (not `''`); surviving metacharacters are still escaped after the strip.

## Relationships

- **`src/infrastructure/persistence/search.ts`** – the sole production import; this file tests its four exported functions (`escapeRegex`, `toSearchPattern`, `addTextFilter`, `addRegexFilter`).
- **`search.property.test.ts`** (referenced in comments, not imported) – owns the property-based / arbitrary-input claims about `escapeRegex`; this file holds only the hand-picked, memorable named cases.
- **`test:fuzz` script / `RANDOM_DATA_SEED`** – the NUL-in-`$regex` 500 was originally discovered by the fuzz harness (seed `108919307`); this file is the regression guard for that finding.

## Notes

- The ReDoS test asserts the *exact* escaped string (`\(a\+\)\+\$`) rather than a wall-clock threshold, deliberately avoiding flaky timing assertions on loaded CI runners.
- NUL stripping is a **separate step** from metacharacter escaping (not another entry in the escape list) because NUL is not a metacharacter—it is a byte the pattern language cannot contain. The two steps compose: strip first, escape second.
- `toSearchPattern` returns `undefined`, **not** `''`, when the entire term is a control character. This matters because `$regex: ''` in MongoDB matches *every* document, which would silently invert the filter.
- The file is intentionally narrow: it documents the *named* failure modes. General "escapes any input" coverage lives in the sibling property test.
