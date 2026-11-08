---
source: tests/unit/infrastructure/config/boolean-words.test.ts
sha256: f0a69cf4bbfde18abbf8c8e9b665defedae6a6636be31711f3415492c350bbfa
generated_at: 2026-11-08T10:10:58.077675+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/boolean-words.test.ts

## Purpose

Unit tests for `parseBooleanWord` and the `TRUTHY_WORDS` / `FALSY_WORDS` constants exported from `src/infrastructure/config/fields.ts`. They pin down the exact vocabulary the codebase uses to interpret switch-like strings (env vars, query params, form fields) and guard against silent mis-parsing of out-of-vocabulary input.

## Key elements

- **`describe('parseBooleanWord')`** — single test suite covering the parser's contract.
- **Truthy case (`it.each`)** — verifies `'1'`, `'true'`, `'TRUE'`, `'yes'`, `'on'`, and whitespace-padded `' true '` all return `true`.
- **Falsy case (`it.each`)** — verifies `'0'`, `'false'`, `'FALSE'`, `'no'`, `'off'`, and `' 0 '` all return `false`.
- **Non-boolean case (`it.each`)** — verifies `''`, `'  '`, `'maybe'`, `'constructor'`, `'__proto__'` return `undefined` (i.e., "not a switch").
- **Consistency check** — asserts every word in `TRUTHY_WORDS` decodes to `true` and every word in `FALSY_WORDS` decodes to `false`, ensuring the exported lists and the parser stay in sync.

## Relationships

- **`src/infrastructure/config/fields.ts`** — sole import target. The test consumes `parseBooleanWord`, `TRUTHY_WORDS`, and `FALSY_WORDS` from this module; no other files are referenced.

## Notes

- Whitespace trimming is part of the contract: inputs like `' true '` and `' 0 '` are expected to be trimmed before matching.
- Prototype-pollution strings (`'constructor'`, `'__proto__'`) are explicitly tested to confirm they are rejected rather than resolved against `Object.prototype`.
- The consistency test (`TRUTHY_WORDS.every(...)`) means adding a word to either exported list without updating `parseBooleanWord` will break this suite, and vice-versa.
