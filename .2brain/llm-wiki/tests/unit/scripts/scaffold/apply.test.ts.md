---
source: tests/unit/scripts/scaffold/apply.test.ts
sha256: 5744a5b0b4440aa1106f158a2df069309cb33c3a9ce8dad72381abd3b6e9baa5
generated_at: 2026-10-15T13:29:55.957919+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/apply.test.ts

## Purpose

Unit test suite for `applyScaffold` that runs against a temporary scratch root. It verifies that all planned files land on disk, that central files are correctly edited (module registry, authorization roles), and that refusal paths (duplicate name, schema-name collision, changed central file shape) write nothing. It deliberately substitutes a no-op formatter because Prettier cannot load under Jest; real formatting is covered by the slower `npm run measure:scaffold` script.

## Key elements

- **`COPIED`** – Array of repo-relative paths (`.prettierrc`, `.prettierignore`, `src/modules.ts`, two YAML files, one test file) that must exist in the scratch root before a scaffold run.
- **`OPTIONS`** – A fixed `ScaffoldOptions` literal (`name: 'scaffold-probe'`, `group: 'foundation'`, `audit: true`) reused by every test.
- **`identity`** – A no-op `FormatText` stub (`(root, file, content) => Promise.resolve(content)`) passed in place of a real formatter.
- **`beforeEach` / `afterEach`** – Create a `mkdtempSync` scratch dir, copy the `COPIED` files into it, seed a fake `Taken` schema under `src/modules/other/openapi.yaml`, then clean up recursively.
- **`describe('applyScaffold')`** – Three tests: (1) all planned files exist and central files are edited; (2) a second run with the same name rejects and leaves `src/modules.ts` unchanged; (3) a mutated `authorization-roles.yaml` causes rejection before any scaffold dir is created.
- **`describe('refusalsFor')`** – Two tests: (1) a scaffold whose name maps to the existing `Taken` schema produces a refusal mentioning `--entity`; (2) a fresh name yields an empty array.

## Relationships

- **`scripts/scaffold/apply.ts`** – Source under test; provides `applyScaffold` and `refusalsFor`.
- **`scripts/scaffold/format-text.ts`** – Supplies the `FormatText` type used to type the `identity` stub.
- **`scripts/scaffold/options.ts`** – Supplies the `ScaffoldOptions` type for the `OPTIONS` constant.
- **`scripts/scaffold/plan.ts`** – Supplies `planModule`, called inside the `refusalsFor` tests to build a plan before checking refusals.
- **`tests/support/paths.ts`** – Supplies `REPO_ROOT` so `beforeEach` can `cpSync` real repo files into the scratch dir.

## Notes

- Prettier is intentionally **not** exercised here; the `identity` formatter exists solely because Jest's module resolution cannot load it. Any formatting assertion would be a no-op.
- The seeded `Taken` schema in `src/modules/other/openapi.yaml` is the only pre-existing module content; tests that rely on the "name already taken" path depend on this fixture.
- The scratch root is fully disposable (`mkdtempSync` + `rmSync`), so the suite never touches the real working tree.
