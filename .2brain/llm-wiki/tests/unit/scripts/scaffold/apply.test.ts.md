---
source: tests/unit/scripts/scaffold/apply.test.ts
sha256: e30bce9059ecc5de32d0af171d9b6c7c4477b1b93dd15d4819e47a81d5a98e61
generated_at: 2026-11-08T10:40:20.790124+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/apply.test.ts

## Purpose

Unit tests for `applyScaffold` and `refusalsFor`, run against a temporary scratch directory. They verify that a successful scaffold writes every planned file and registers the module in central files, and that a refusal (duplicate name, shape mismatch, taken schema) leaves the filesystem untouched. Real-repo integration checks (including Prettier formatting) are deferred to `npm run measure:scaffold`.

## Key elements

- **`COPIED`** – list of repo files (`.prettierrc`, `src/modules.ts`, YAML configs, etc.) copied into each scratch root so the apply logic has realistic inputs.
- **`OPTIONS`** – a fixed `ScaffoldOptions` object (`scaffold-probe` / `foundation`) used across tests.
- **`identity`** – a no-op `FormatText` stub; stands in for Prettier because Prettier cannot load under Jest.
- **`beforeEach`** – creates a `mkdtempSync` scratch dir, copies `COPIED` files from `REPO_ROOT`, and seeds `src/modules/other/openapi.yaml` with a schema named `Taken` to exercise name-collision logic.
- **`afterEach`** – recursively removes the scratch dir.
- **`describe('applyScaffold')`** – three cases: (1) all planned files exist and central files are updated; (2) a second apply with the same name rejects and the registry is unchanged; (3) a mutated `authorization-roles.yaml` causes a pre-write rejection and no module dir is created.
- **`describe('refusalsFor')`** – two cases: (1) a taken schema name produces a message referencing `--entity`; (2) a fresh name yields an empty array.

## Relationships

- **`scripts/scaffold/apply.ts`** – imports `applyScaffold` and `refusalsFor`, the two units under test.
- **`scripts/scaffold/format-text.ts`** – imports the `FormatText` type to type the `identity` stub.
- **`scripts/scaffold/plan.ts`** – imports `planModule` to build a plan for the `refusalsFor` tests.
- **`scripts/scaffold/options.ts`** – imports the `ScaffoldOptions` type for the `OPTIONS` constant.
- **`tests/support/paths.ts`** – imports `REPO_ROOT` to locate real repo files for the scratch-dir copy.

## Notes

- The `identity` formatter intentionally skips real Prettier runs; formatting is covered by the separate `measure:scaffold` script, not this unit suite.
- The seeded `Taken` schema in `beforeEach` is the *only* fixture needed for name-collision tests—no additional scaffolding is required.
- Tests are written against a `mkdtempSync` path, so they never touch the actual working tree.
