---
source: tests/cross-cutting/permission-model-version-conformance.test.ts
sha256: c9dbed5907ae72932ba3cfec91c2e3c153936fadba77973a868c3a2131880ca0
generated_at: 2026-11-08T09:29:31.118006+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/permission-model-version-conformance.test.ts

## Purpose

Cross-cutting conformance test that ensures the TypeScript `permissionModelVersion` function returns the same results as its PHP counterpart. Both implementations are driven by the same shared YAML case file (`shared/cases/permission-model-version.cases.yaml`), so any divergence between languages is caught here.

## Key elements

- **`versionCase`** — Zod schema extending `caseBase` with two fields: `ids` (`string[]`) and `version` (non-negative integer). Describes the shape of each conformance case.
- **`describeCases('permission-model-version', versionCase, (one) => …)`** — Loads all cases from the shared YAML file, validates each against `versionCase`, and asserts `permissionModelVersion(one.ids) === one.version`.

## Relationships

- **`src/kernel/permissions.ts`** — Provides `permissionModelVersion`, the function under test.
- **`tests/support/cases.ts`** — Provides `caseBase` (shared Zod base schema) and `describeCases` (helper that loads and iterates a shared YAML case file).

## Notes

- The source of truth for expected behavior is the shared YAML file, not the TS code. If a case fails, the YAML file is authoritative; fix the implementation, not the test.
- The file lives under `tests/cross-cutting/` (not `tests/unit/`), signalling it is language-parity infrastructure rather than a single-module unit test.
- `version` is constrained to `nonnegative()` at the schema level; a negative value in the YAML will be a validation error, not an assertion failure.
