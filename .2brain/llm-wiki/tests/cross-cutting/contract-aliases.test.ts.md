---
source: tests/cross-cutting/contract-aliases.test.ts
sha256: 2c649870dd15411a8de60f661e518c35e317ec2304e03bc130136ff5b833498d
generated_at: 2026-11-08T09:25:05.433409+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-aliases.test.ts

## Purpose

Validates the structural and semantic integrity of the `x-alias-of` OpenAPI extension across the API spec. The extension marks operations that are alternate spellings of a canonical operation (e.g. `POST /products/search` aliasing `GET /products`). This test suite enforces that the annotation is well-formed (no dangling refs, no chains, no self-references) and that an alias is truly interchangeable with its canonical target (same success status code, same JSON response schema).

## Key elements

- **`operations`** — flattened array of every operation in `openapi.yaml` with its `route`, `method`, and operation object.
- **`byOperationId`** — `Map<operationId, {route, method, operation}>` for O(1) lookup of a canonical target.
- **`aliases`** — the subset of `operations` whose operation carries an `x-alias-of` key.
- **`successSchema(operation)`** — extracts the first 2xx response's `application/json` schema and returns its `JSON.stringify` form. Compares only the schema, deliberately excluding the human-readable `description`.
- **`successStatus(operation)`** — returns the first 2xx status-code string (e.g. `"200"` vs `"201"`).
- **`describe('operation aliases')`** — six assertions:
  1. Tripwire: spec was parsed and yielded >50 operations and >3 aliases.
  2. Every `x-alias-of` value resolves to an existing `operationId`.
  3. No alias points at another alias (no chains).
  4. No alias names itself.
  5. Alias and canonical return the same success status.
  6. Alias and canonical return the same success schema.

## Relationships

No graph neighbors are recorded. The file's sole runtime input is `../../openapi.yaml`, resolved relative to `__dirname` and parsed with the `yaml` package.

## Notes

- The tripwire test (`expect(operations.length).toBeGreaterThan(50)`) exists to prevent all assertions from passing vacuously if the spec path is wrong or the file is empty.
- `successSchema` intentionally compares only the JSON schema object, not the response `description`. Two alias spellings may have different prose ("Users list page" vs. "Users search results") without violating the interchangeability contract.
- The `x-alias-of` extension was chosen over `deprecated: true` because orval emits a deprecation warning on every call to a deprecated operation; these routes are fully supported and not slated for removal. The `x-` prefix is ignored by code generators, so the annotation is zero-cost at generation time and the tests above are its only enforcement mechanism.
