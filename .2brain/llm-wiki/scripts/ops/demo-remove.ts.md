---
source: scripts/ops/demo-remove.ts
sha256: db60d0a0c1890677f1b85aa1e1c709a6f16b6976e8edee892f9c1dad92f0096d
generated_at: 2026-10-01T12:35:53.021841+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove.ts

## Purpose

CLI entry-point for `npm run demo:remove` (G-D2 step 3 / FE-D4). Performs the irreversible, in-place removal of every `group: shop` demo module from the current checkout: deletes the module folders, strips their references from central files, removes demo scenario/collection data, and edits the shared OpenAPI contract fragment. It is the "real command" (step 3), distinct from the measurement script that runs against a scratch copy.

## Key elements

- **`REPO_ROOT`** — resolved once via `path.resolve(__dirname, '..', '..')`; passed to every removal helper.
- **`report(notes: readonly RemovalNote[])`** — local helper that prints one `file — detail` line per note to stdout.
- **`shopModuleNames`** — obtained at start via `readShopModuleNames(REPO_ROOT)`; drives the entire run.
- **Execution sequence** (top-level, no wrapper function):
  1. `removeModules` — deletes module folders and central registrations.
  2. `removeGeneratedProductImages`, `removeShopOnlyScenarioFiles`, `stripShopModulesTable`, `stripScenarioIndex`, `stripSubjects`, `stripClientCollections`, `stripSeedImageGenerator` — clean up the demo catalogue, generated collections, and scenario index files.
  3. `stripAccountExportSchema` — removes the shop-only fragment from `shared/contracts/openapi.root.yaml`.
  4. Prints a two-step "Next" reminder (`npm run regenerate`, `npm run ts-check`).

## Relationships

- **`scripts/testing/shop-module-names.ts`** — imports `readShopModuleNames`; the sole source of the module list.
- **`scripts/ops/demo-remove-modules.ts`** — imports `removeModules`; handles folder deletion and central-file edits.
- **`scripts/ops/demo-remove-registry.ts`** — imports the `RemovalNote` type used as the uniform reporting shape.
- **`scripts/ops/demo-remove-scenarios.ts`** — imports seven strip/remove functions for scenario data, generated images, subjects table, scenario index, client collections bundle, and seed-image generator.
- **`scripts/ops/demo-remove-contract.ts`** — imports `stripAccountExportSchema` for the OpenAPI contract fragment.

## Notes

- Runs **against the live checkout**, not a copy — the file's own doc comment flags this explicitly. There is no dry-run mode.
- The doc comment references `demo-remove-tests.ts` (removing tests that import a removed module) and the promise documented in `docs/getting-started-new-project.md`; neither file is imported here, so that logic either lives inside `removeModules` or is handled by a separate step.
- The script is a flat top-level sequence (no `main()` wrapper) — it relies on `tsx` to execute the `.ts` file directly via the shebang.
- After running, `npm run ts-check` may still report residual string/table references; the script's own output instructs the operator to fix those by hand.
