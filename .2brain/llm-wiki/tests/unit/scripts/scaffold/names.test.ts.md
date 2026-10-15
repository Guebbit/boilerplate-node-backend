---
source: tests/unit/scripts/scaffold/names.test.ts
sha256: 0814f8af761ec1898c43e9c8616a3119399333315d798472df8940f376ea980d
generated_at: 2026-10-15T13:31:26.195679+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/names.test.ts

## Purpose

Unit tests for the scaffold naming module. It verifies that module-name validation, name derivation (all casing/spelling variants), and permission-key generation produce the exact strings that every code template relies on. A silent casing bug here would propagate into every generated file.

## Key elements

- **`isValidModuleName` tests** — Accepts kebab-case lowercase strings (`notes`, `field-notes`, `api-keys`); rejects uppercase, underscores, digits, leading/trailing hyphens, double hyphens, and empty strings.
- **`isValidEntityName` tests** — Confirms strict PascalCase letters-only input is accepted; camelCase and hyphenated forms are rejected.
- **`deriveNames` tests** — Validates the full derived-name object from a hyphenated plural input (kebab, identifier, family, entity, entityCamel, entitySnake, plural, pluralCamel, basePath, words). Also covers naive singularization edge cases (`glass` → `Glass`, `boxes` → `Boxe`), the `--entity` override to correct wrong nouns, and the guarantee that singular folder names still produce distinct entity and plural type names.
- **`permissionKeys` tests** — Confirms keys are hyphen-free, use the `family` spelling, and emit exactly one key per CRUD action (`.any.read`, `.any.create`, `.any.update`, `.any.delete`).

## Relationships

- **`scripts/scaffold/names.ts`** — The module under test. This file imports `deriveNames`, `isValidEntityName`, `isValidModuleName`, and `permissionKeys` from it. No other files are referenced.

## Notes

- The test docstring flags the design intent: this module is a single source of truth for identifier casing across all scaffold templates, so tests treat exact string output as the contract (`.toEqual`, not partial match).
- Naive singularization is explicitly *not* expected to be linguistically correct (`boxes` → `Boxe`); the `--entity` flag is the documented escape hatch, and the tests lock in both behaviors.
- The `permissionKeys` grammar is letters and dots only (no hyphens), which is why `isValidModuleName` also rejects digits and underscores upstream.
