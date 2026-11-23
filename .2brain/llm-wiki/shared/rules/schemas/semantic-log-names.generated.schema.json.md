---
source: shared/rules/schemas/semantic-log-names.generated.schema.json
source_sha256: 364f423fc1d6a925202ca1050d9ae35b13d2912a090c244364d22a88715bf547
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:28:21.495374+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/semantic-log-names.generated.schema.json

## Purpose
A JSON Schema (draft 2020-12) that validates a "semantic log names" document: an object mapping camelCase identifiers to non-empty string values. The `.generated` name suggests it is produced by tooling rather than hand-edited.

## Key elements
- **Root object**: requires a single property, `semanticLogNames`; no other top-level properties are allowed (`additionalProperties: false`).
- **`semanticLogNames`**: an object whose keys must match `^[a-z][A-Za-z0-9]*$`. That means a lowercase first letter followed by letters or digits only, with no underscores, hyphens, or dots.
- **Values**: each value must be a string of at least one character (`minLength: 1`).

## Relationships
No graph neighbors are listed. The schema declares no `$ref`s, and nothing in the file shows what consumes or generates it.

## Notes
- The `.generated` suffix implies edits should be made in the generator or its source, not in this file. The generator is not visible here.
- The key pattern rejects PascalCase, snake_case, and kebab-case names. Keys must be lowerCamelCase.
- The schema places no constraint on the string values beyond being non-empty, and an empty `semanticLogNames` object is valid because `minProperties` is not set.
