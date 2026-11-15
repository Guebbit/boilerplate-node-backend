---
source: tests/unit/scripts/docs/document-facts.test.ts
sha256: d8c4642eeaf37b90926c89f45a4e95e75cf038a29cc7aefd72850d07343060e0
generated_at: 2026-11-15T00:26:07.637194+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/docs/document-facts.test.ts

## Purpose

Unit tests for the `document-facts` module. They verify two things: that `npmScriptsCited` correctly extracts and deduplicates `npm run` script names from Markdown text (including wildcard prose), and that `missingScripts` reports which cited scripts are absent from a known-scripts set.

## Key elements

- **`describe('npmScriptsCited')`** — two cases:
  - Extracts `check` and `gen:api` from a mix of inline code and a fenced `sh` block, confirming duplicates are removed.
  - Confirms a prose wildcard like `` `npm run test:*` `` is reduced to the base name `test`.
- **`describe('missingScripts')`** — one case with a fixed `pages` array:
  - Given a set of known scripts `['here', 'there']`, expects only the unknown script `gone` to appear in the result, with the problem message `` "`npm run gone` is not a script" ``.

## Relationships

- Imports `npmScriptsCited` and `missingScripts` from `scripts/docs/document-facts.ts` — the module under test.
- No other runtime dependencies; all inputs are inline literals.

## Notes

- The `pages` fixture for `missingScripts` is defined at the `describe` scope, so any new test case in that block reuses the same single-page array. Add a new `it` inside the describe or move the fixture if you need different page data.
- The expected output shape for `missingScripts` is an array of `{ page, problem }` objects — if the source module changes its return shape, this test will fail on a deep-equality mismatch rather than a type error (no explicit type assertion here).
