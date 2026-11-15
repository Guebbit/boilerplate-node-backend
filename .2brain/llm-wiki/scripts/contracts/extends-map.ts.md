---
source: scripts/contracts/extends-map.ts
sha256: a4ff71b285f31597d620ef6c2fabc9b05db4f94c1e2552b3d6fc57703f8239b6
generated_at: 2026-11-14T17:23:53.402349+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/extends-map.ts

## Purpose

Centralises the parsing and validation of a fragment's `x-extends` map so that OpenAPI and AsyncAPI tooling apply identical rules (must be a map of non-empty, duplicate-free string lists; every referenced name must be declared in the fragment). Without this shared module, the two formats could diverge on what counts as a malformed map.

## Key elements

- **`parseExtendsMap(declared, where)`** (exported) — Validates that `declared` is a plain object whose values are non-empty string arrays with no duplicates; returns the typed `Record<string, string[]>` map or throws a descriptive `Error` (message prefixed with the `where` label).
- **`requireDeclared(names, declared, where)`** (exported) — Iterates `names` and throws if any name is absent from `declared` (the fragment's own schema/components map). Used to reject variants a fragment does not actually define.
- **`isStringList(value)`** (module-local type guard) — Narrows `unknown` to `string[]` by checking `Array.isArray` plus an `every` typeof check.

## Relationships

- **`src/infrastructure/object-guards.ts`** — Provides the `isPlainObject` helper used in `parseExtendsMap` to reject non-object values (arrays, null, primitives).
- **`scripts/contracts/openapi-extensions.ts`** — Calls `parseExtendsMap` and `requireDeclared` when building/validating OpenAPI extension fragments.
- **`scripts/contracts/asyncapi-section-fragments.ts`** — Calls the same two functions when processing AsyncAPI section fragments, ensuring identical acceptance criteria.
- **`tests/unit/scripts/contracts/extends-map.test.ts`** — Unit-tests both exports (valid maps, empty lists, duplicates, non-object inputs, undeclared variants).

## Notes

- The `where` parameter is a human-readable label (e.g. `[openapi] /path/file.yaml`) embedded in every error message; callers are expected to supply it.
- Validation is fail-fast: the first offending key/entry throws; subsequent entries are not inspected.
- `requireDeclared` uses `Object.hasOwn` (not `in`), so it will not match keys inherited on the prototype chain.
- The module is side-effect-free and exports only pure functions, making it safe to import in both CLI and library contexts.
