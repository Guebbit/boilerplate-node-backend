---
source: scripts/eslint/no-persistence-imports.ts
sha256: 540359e0b2495e4b225c2a93698ca2dbf1822146d2fc4357655f1fe32c14bc1b
generated_at: 2026-11-14T17:35:21.974491+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/no-persistence-imports.ts

## Purpose

A custom ESLint rule that enforces the "persistence behind the repository" boundary: a collection's `model` or `repository` module may only be imported from that collection's own `repository.ts`. Any other import—whether by binding-name suffix or by module path—is reported as a problem. This keeps a single choke-point for query shape so schema changes don't ripple across the codebase.

## Key elements

- **`RuleOptions`** (exported interface) — the single optional config object: `bindings` (array of name-suffixes to flag) and `paths` (whether the path check runs).
- **`noPersistenceImports`** (exported const) — the ESLint rule itself, built with `RuleCreator.withoutDocs`. Visits `ImportDeclaration` nodes and reports either a `binding` or `path` violation.
- **`DEFAULT_BINDINGS`** — `['Repository', 'Model']`; used when the rule is enabled without explicit `bindings`.
- **`PERSISTENCE_PATH`** — regex `/(?:^|\/)(?:model|repository)$/`; matches a specifier whose final path segment is exactly `model` or `repository` (segment-boundary anchored so `base-repository` is *not* matched).
- **`specifierNames`** (internal helper) — returns both the local and the imported identifier for a specifier, so `userModel as Users` is caught on either name.
- **`MessageIds`** — `'binding'` | `'path'`; the two report messages.

## Relationships

- **`scripts/eslint/index.ts`** — imports `noPersistenceImports` and registers it as part of the shared ESLint plugin's rule set.
- **`tests/unit/scripts/eslint/no-persistence-imports.test.ts`** — unit-tests the rule's `binding` and `path` checks, including edge cases like renamed imports, `import type`, and the `base-repository` false-positive guard.

## Notes

- The path check and the binding check are mutually exclusive per declaration: if the path matches, the rule reports **once** on the source and skips the per-specifier name loop. This avoids double-reporting a single mistake on one line.
- `import type` is intentionally *not* excluded; the doc comments and `path` message both explain that the type is the schema, so the coupling survives erasure.
- `PERSISTENCE_PATH` is anchored on a `/` or start-of-string boundary. A bare `endsWith('repository')` would false-positive on shared helpers like `@infrastructure/persistence/base-repository`.
- Setting `bindings` to an empty array (`[]`) disables the name check while leaving the path check active (if `paths` is not explicitly `false`).
