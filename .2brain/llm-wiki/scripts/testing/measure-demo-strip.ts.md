---
source: scripts/testing/measure-demo-strip.ts
sha256: d26f495ec87c34013e955057de0fd467e9e9ff6ac8423096e1ebb12794afd097
generated_at: 2026-10-01T12:41:02.814733+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/measure-demo-strip.ts

## Purpose

G-D2 step 1: a report-only measurement script that applies a module-removal recipe to a **scratch copy** of the checkout and then runs a fixed set of checks (regenerate, `ts-check`, cross-cutting tests, docs build) to surface what still couples the rest of the repo to the removed module. Failures are the "punch list," not a CI gate.

## Key elements

- **`SCRATCH`** — path under `os.tmpdir()` where the scratch copy lives (must be outside the repo because `fs.cpSync` rejects a destination nested inside its own source).
- **`Check` / `CHECKS`** — the four commands run after removal: `regenerate`, `ts-check`, `test:cross-cutting`, `docs:build`.
- **`Recipe` / `RECIPES`** — maps a `--recipe` CLI value to a removal action + description. Two recipes: `shop` (delegates to `demo-remove.ts` inside the scratch tree) and `locales` (calls `removeModules` directly).
- **`runInScratch`** — runs a command in the scratch dir and **throws** on failure; used only for recipe application (a recipe that can't apply is a script bug, not a finding).
- **`run`** — runs one `Check` and returns a boolean; never throws. A failing check *is* the measurement.
- **Main flow** — parses `--recipe` (defaults to `shop`), assembles scratch copy, applies the recipe, runs all checks, prints a PASS/FAIL summary, sets `process.exitCode` (0 if all green, 1 otherwise).

## Relationships

- **`scripts/ops/demo-remove-modules.ts`** — provides `removeModules`, used by the `locales` recipe to delete the target folder and its registry lines in the scratch tree.
- **`scripts/testing/scratch-copy.ts`** — provides `assembleScratchCopy` (copies the repo into `SCRATCH`) and `runIn` (spawns a command with a given cwd); both are the script's primary I/O primitives.
- **`scripts/testing/shop-module-names.ts`** — provides `readShopModuleNames`, used by the `shop` recipe's `describe()` to list module names in the console output.

## Notes

- The `shop` recipe shells out to `scripts/ops/demo-remove.ts` (a *different* file) inside the scratch tree via `npx tsx`; it does not import it directly.
- Report-only by intent: the script is deliberately **not** wired into the CI gate so that expected failures don't block unrelated PRs. Promote to `ci` once the relevant recipe goes green.
- `runInScratch` throws (recipe must apply cleanly) while `run` swallows failures (they are the data). Conflating the two would misclassify a measurement as a script error.
- Default recipe is `shop` when `--recipe` is omitted from the CLI.
