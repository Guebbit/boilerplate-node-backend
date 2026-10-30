---
source: tests/cross-cutting/permission-model-version-conformance.test.ts
sha256: 568f6428ad058e5c269e0dbec6acddd6767651580ba181bfad3d6ad88daa44b7
generated_at: 2026-10-29T06:48:13.766750+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/permission-model-version-conformance.test.ts

## Purpose

Conformance test that verifies `permissionModelVersion` returns the same version number the PHP twin produces for an identical set of rule IDs. Cases are defined in a shared YAML file (`shared/cases/permission-model-version.cases.yaml`) so both implementations stay in lockstep.

## Key elements

- **`versionCase`** — Zod schema extending `caseBase` with two fields: `ids` (array of rule-id strings) and `version` (non-negative integer, the expected result).
- **`describeCases('permission-model-version', versionCase, 5, …)`** — Drives 5 shared cases through the assertion `permissionModelVersion(one.ids) === one.version`.

## Relationships

- **`src/kernel/permissions.ts`** — Source of `permissionModelVersion`, the function under test. The test asserts its output matches the version recorded in the shared cases.
- **`tests/support/cases.ts`** — Provides the `caseBase` schema and the `describeCases` helper that loads the YAML cases, validates them against the Zod schema, and runs the per-case assertion block.

## Notes

- The case count is hardcoded to `5`; adding a case to the YAML file without bumping this number will silently skip new entries.
- The comment explicitly ties this to the PHP twin's permission-model version, so the YAML file is the single source of truth across languages — changes there are a cross-language contract.
