---
source: tests/unit/infrastructure/http/request.test.ts
sha256: 545ac153b7e07bfab92e09cdf9c08c09ad0a028b176ce8605bb0146a95d25639
generated_at: 2026-10-15T13:15:30.538528+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/request.test.ts

## Purpose

Unit tests for `readInput` (and the smaller helpers `parseFormBoolean`, `parseFormCsvList`, `callerContextOf`) from the HTTP request-reading layer. Because every controller funnels through `readInput` and the integration/contract suites never probe it directly, this file exists to pin down each rule the declaration encodes—surface precedence, ID resolution, multipart-only type coercion, undefined-key handling, and the express-5 "no body means `undefined`" edge case.

## Key elements

- **`makeRequest(overrides)`** — Builds a minimal `express.Request` stub via `asStub` that carries `params`, `body`, `query`, and a working `is(type)` method. `is` returns the matched content-type string, `false` on mismatch, or `null` when no `contentType` was supplied (mirroring express' "no body" signal).
- **`describe('readInput') → 'precedence'`** — Verifies the per-surface source order (`search`→body, `write`→params, `delete`→params, `path`→params), fallback when the higher source lacks the key, merging of disjoint keys, exclusion of sources a surface doesn't read, dropping of explicitly-`undefined` values, the no-body path, and that absent pagination stays `undefined` (defaults live in `normalizePagination`).
- **`describe('readInput') → 'ids'`** — Covers ID-specific resolution: first-source-wins, fallback to body, reading from `params` when `body` is `undefined` (express 5), empty-string fall-through, empty-value retention, repeated-ID-as-array (malformed, not silently picked), and absent-key stays absent.
- **`describe('readInput') → 'transport decoding'`** — Asserts multipart-only coercion: booleans (`'false'`→`false`), string→array (`'tools'`→`['tools']`), number parsing (`'101.5'`→`101.5`), unparseable-number passthrough, empty-string-not-zero, zero-is-valid, and that JSON bodies are left byte-for-byte untouched so downstream validators see the original type violation.
- **Constants** — `OBJECT_ID` (valid 24-hex for format-sensitive assertions), `JSON_TYPE`, `FORM_TYPE`.

## Relationships

- **`src/infrastructure/http/request.ts`** — Module under test; imports `readInput`, `callerContextOf`, `parseFormBoolean`, `parseFormCsvList`.
- **`tests/support/stub.ts`** — Provides `asStub`, used by `makeRequest` to cast the plain object literal into a typed `Request` stand-in.
- **`tests/support/callers.ts`** — Provides `asCustomer` (imported, likely for `callerContextOf` / `callerInScope` tests further in the file).
- **`src/kernel/permissions.ts`** — Provides `callerInScope`, imported for caller-context assertions.

## Notes

- The express-5 `request.body === undefined` case is called out in multiple tests; the file header explicitly warns that a body-less `DELETE` would 500 without the guard `readInput` provides.
- Multipart decoding is **transport-conditional by design**: the same key in a JSON body must *not* be coerced, so the validator's own type error reaches the caller. Tests assert both sides of that rule.
- `Number('') === 0` in JS is a known footgun; the tests pin that an empty form field must pass through as `''`, not become `0`, because a free product is a legal price.
- Repeated IDs (e.g. `id: [a, b]`) are deliberately left as arrays so the downstream ID validator returns 422 rather than `readInput` silently selecting an entry.
- The file header documents *why* this test exists in isolation: `readInput` is "small enough to look self-evident" yet reached by every controller, and the integration/contract suites never ask it a question of their own.
