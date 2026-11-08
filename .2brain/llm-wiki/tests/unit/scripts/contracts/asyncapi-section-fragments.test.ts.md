---
source: tests/unit/scripts/contracts/asyncapi-section-fragments.test.ts
sha256: 9cd25f4e43c54c68560161ed0bafddfb1f74807f3ebd4349027885268b192395
generated_at: 2026-11-08T10:32:28.916172+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/asyncapi-section-fragments.test.ts

## Purpose

Unit tests for the three exported functions in `scripts/contracts/asyncapi-section-fragments.ts` (`withSectionFragments`, `sectionFragments`, `localiseOpenApiReferences`). They verify the contract that section fragments merge into AsyncAPI section documents correctly, that external OpenAPI schema references are inlined safely, and that malformed or ambiguous fragments are rejected with clear errors.

## Key elements

- **`withSectionFragments` tests** — the main entry point. Verifies:
  - Only the `webhooks` section triggers per-owner fragment merges (other sections are untouched).
  - Fragment `x-extends` entries append `$ref` items to the target `oneOf` union.
  - The extended union schema is repositioned *after* the schemas it references (ordering guarantee).
  - Reference cycles are detected and terminated without infinite loops.
  - A battery of rejection cases via `it.each`: non-map `x-extends`, non-list values, undeclared variant names, duplicate names, and names the union already holds.

- **`sectionFragments` tests** — confirms the glob/pattern that finds fragment files named `asyncapi.<section>.yaml` under a modules root, and returns an empty array for sections with no fragments.

- **`localiseOpenApiReferences` tests** — verifies inlining of `./openapi.yaml#…` and `../<module>/openapi.yaml#…` `$ref`s:
  - The referenced schema is copied in before its first user, tagged with `x-openapi-schema`.
  - All referencing `$ref`s are rewritten to the local `#/components/schemas/…` form.
  - No filesystem read occurs when no `$ref` points at the REST file.
  - Rejections: missing schema in REST file, self-referencing schema, open enum (`x-enum-from`), and fragment declaring the same name it references.

- **Helpers** — `emptySection()`, `section()`, `mergeSchemas`, `modulesRoot()`, `restFile()` build minimal YAML `Document` instances and temp directory trees so tests exercise the real `yaml` parsing/mutation path rather than plain objects.

## Relationships

- **`scripts/contracts/asyncapi-section-fragments.ts`** — the module under test; all three imported symbols are exercised here. The test file is the sole unit-test neighbor in the dependency graph.

## Notes

- File-system-dependent tests create temp roots via `mkdtempSync` under `os.tmpdir()` and clean them up in `afterEach`; the `roots` / `folders` arrays are spliced (not cleared) to avoid cross-test leakage.
- `mergeSchemas` is a *reduced* merge (only `components.schemas` insertion) used to isolate ordering and cycle-detection logic from the real bundler merge.
- Tests assert on `Document` key ordering (`Object.keys`) because the production code relies on insertion order for the "union after its variants" guarantee.
- The `it.each` rejection tables double as a living spec of every supported error message; changing an error string in the source will break the corresponding test.
