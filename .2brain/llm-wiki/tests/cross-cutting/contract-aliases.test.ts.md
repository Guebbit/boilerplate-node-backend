---
source: tests/cross-cutting/contract-aliases.test.ts
sha256: 9ec8e003e886d5dec6b2ccd8d261597173c9f15bdc48bf1f8b694cae83b286f7
generated_at: 2026-09-23T19:54:28.685766+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-aliases.test.ts

## Purpose

Validates the `x-alias-of` OpenAPI extension in `openapi.yaml`, ensuring that every alias operation is a true interchangeable spelling of its canonical counterpart. It exists because the contract deliberately ships multiple operations for the same intent (e.g. `DELETE /users` vs `DELETE /users/{id}` vs `DELETE /users/{id}/hard`), and without enforcement the "switchable" claim would silently rot as responses drift apart.

## Key elements

- **`operations`** – flattened array of every `{ route, method, operation }` tuple extracted from the parsed spec.
- **`byOperationId`** – `Map<operationId, { route, method, operation }>` for O(1) canonical lookups.
- **`successSchema(operation)`** – returns a JSON string of the `application/json` schema of the first `2xx` response; used to compare parseable payloads across aliases.
- **`successStatus(operation)`** – returns the first `2xx` status code string (e.g. `"200"` vs `"201"`).
- **`describe('operation aliases')`** – the test suite; six `it` blocks covering:
    - Tripwire: spec actually parsed and aliases found.
    - Referential integrity: every `x-alias-of` target exists by `operationId`.
    - No alias-of-alias chains.
    - No self-referential aliases.
    - Alias and canonical return the same success status code.
    - Alias and canonical return the same success response schema.

## Relationships

No graph neighbors are recorded for this file. It is a leaf test that reads `openapi.yaml` (via a relative path) and depends only on `yaml`, `node:fs`, and `node:path`.

## Notes

- The spec is resolved relative to the test file's directory: `../../openapi.yaml`. If the test is moved, the path breaks silently (it would throw on read, but the tripwire assertion would never be reached).
- `successSchema` only inspects the **first** `2xx` response and only the `application/json` content type. An alias that adds a second 2xx variant or changes the content type will not be caught.
- The design explicitly avoids `deprecated: true` because orval emits warnings for deprecated operations, which would flag routes the API fully intends to keep. The `x-` extension is ignored by all code generators.
- The test does **not** compare response descriptions (prose) — only the schema object. This is intentional: descriptions may legitimately differ while the payload shape stays the same.
- Referenced rationale: `docs/theory/request-input.md` explains why multiple spellings exist; this file encodes the "which one is canonical" half of that argument.
