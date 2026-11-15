---
source: tests/cross-cutting/api-standards.test.ts
sha256: c10561c6101178cb0dfc32cd87093d0ef8c57ca0eee63fd7265e657db8875f1a
generated_at: 2026-11-14T23:01:08.332556+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/api-standards.test.ts

## Purpose

Enforces two REST-contract standards as executable checks against **source** files (module `openapi.yaml` fragments and `.ts` code), so a module author cannot ship a resource or a 409 response that violates the rules stated in `docs/theory/tactical-ddd.md` and `docs/api/write-methods.md`. Failures name the file a human edits, not a generated bundle.

## Key elements

- **`contracts`** (module-level constant) — discovers every module directory under `MODULES_ROOT` that ships an `openapi.yaml`, parses it with the `yaml` library, and narrows the result to the `Fragment` interface.
- **`Fragment` / `SchemaNode` / `OperationNode`** — minimal structural interfaces describing only the slice of OpenAPI the tests read (error codes, paths, component schemas, `$ref`, `enum`, `allOf`, `required`, `properties`).
- **`enumValues(fragment, node)`** — resolves a schema's `enum` by following local `#/components/schemas/…` `$ref`s and flattening `allOf` wrappers.
- **`sourceFiles(directory)`** — recursively collects `.ts` files, skipping any `tests/` sub-directory.
- **`callText(source, start)`** — returns the text of a call expression (name through matching closing paren) starting at a character offset.
- **`describe('a resource with a lifecycle status publishes required actions')`** — three tests: (1) a canary floor (≥ 3 records found), (2) every non-exempt record lists `actions` in its `required` array, (3) no entry in the `EXEMPT` map still qualifies (i.e. the exemption hasn't gone stale).
- **`describe('a 409 refusal carries an error code')`** — three tests: (1) a canary floor (≥ 20 refusals found), (2) every 409 call site references a `code` key or `ERROR_CODES`, (3) every `ERROR_CODES.*` identifier used in source is declared in some module fragment's `x-error-codes` or in the shared root contract.
- **`EXEMPT`** (local to first describe) — a hand-maintained map of `module.Schema` → reason, for records that legitimately carry a multi-valued `status` without publishing their own `actions`.
- **`NOT_A_RECORD`** (local to first describe) — a regex (`Search|Export|Update|Create|Observability` prefix) that excludes request-body / log-row schemas from the sweep.
- **`CALL`** (local to second describe) — a regex matching `generateReject(…409)` and `refuse(…409)` call sites.

## Relationships

- **`tests/support/paths.ts`** — imports `MODULES_ROOT` (used to locate per-module contract fragments) and `REPO_ROOT` (used as the base for walking `src/` and for resolving the shared root contract path).

## Notes

- The 409-detection regex (`CALL`) is intentionally narrow: it only catches the named helper functions it matches. A new 409-emitting helper that doesn't use one of these will silently escape the sweep.
- The `EXEMPT` map is a **negative** allow-list: adding a new record that legitimately has no `actions` requires an entry here, and the third test in the first `describe` will fail if you forget to remove an entry once the record *does* publish `actions`.
- `enumValues` only resolves `$ref`s whose target lives in the **same** fragment (`#/components/schemas/…`); cross-fragment refs will silently return `[]`.
- The `sourceFiles` walker excludes directories named `tests` at any depth, so helper utilities under `src/**/tests/` are not scanned for 409 calls.
- Both `describe` blocks include a "finds the records/refusals" canary test with a `toBeGreaterThanOrEqual` floor. If a fragment layout change or a source restructure drops the count below the floor, the canary fails *before* the real assertion can pass vacuously.
