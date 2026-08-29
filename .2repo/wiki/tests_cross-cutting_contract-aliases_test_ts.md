# tests/cross-cutting/contract-aliases.test.ts

## Purpose

Validates the `x-alias-of` annotation in `openapi.yaml` to enforce that aliased operations (e.g. `DELETE /users` vs `DELETE /users/{id}`) are true alternates of a single canonical operation. It guarantees the annotation points to a real, non-aliased operation and that the alias and canonical return the same success status and response schema — the invariants a caller depends on when treating them as interchangeable.

## Key elements

- **`operations`** — flat array of every HTTP operation in the spec (route, method, operation object), parsed directly from `../../openapi.yaml`.
- **`byOperationId`** — `Map<operationId, {route, method, operation}>` for O(1) lookup of the canonical target.
- **`aliases`** — subset of `operations` that carry an `x-alias-of` key.
- **`successSchema(operation)`** — extracts the `application/json` schema of the first 2xx response and serializes it to a comparable string (schema only, not response prose).
- **`successStatus(operation)`** — returns the first 2xx status code string (e.g. `"200"`).
- **`describe('operation aliases', …)`** — six assertions:
  1. Tripwire: >50 operations and >5 aliases exist (guards against silent parse failure).
  2. No dangling `x-alias-of` references.
  3. No alias → alias chains.
  4. No self-referential aliases.
  5. Alias and canonical share the same success **status** code.
  6. Alias and canonical share the same success **schema**.

## Relationships

No graph neighbors recorded.

## Notes

- Reads `openapi.yaml` at runtime via `readFileSync`; there is no build step or generated fixture.
- Deliberately uses an `x-` extension rather than `deprecated: true` so code generators (orval) ignore it and do not emit warnings for still-supported routes.
- The schema comparison is structural (`JSON.stringify` of the schema object), not a textual description match — two operations can have different human-readable `description` strings and still pass.
- The status-code check exists independently of the schema check because a caller branches on `200` vs `201` before parsing the body; a mismatch breaks the "swap the spelling" contract even if the shapes happen to match.
- If a schema-mismatch assertion fails, the intended fix is to correct the drifted response in the spec, not to remove the `x-alias-of` annotation.
