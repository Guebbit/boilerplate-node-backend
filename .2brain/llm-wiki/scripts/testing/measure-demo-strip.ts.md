---
source: scripts/testing/measure-demo-strip.ts
sha256: 0815451332ed1b90db09bd67f72be7dfd19a2fa2086225bf1f091780687c0b21
generated_at: 2026-10-15T09:48:21.792268+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/measure-demo-strip.ts

## Purpose

Diagnostic script that measures how far "a module is removable" actually is. It applies a removal **recipe** (`shop` or `locales`) to a scratch copy of the checkout, regenerates, then runs `ts-check`, the cross-cutting test suite, and `docs:build` against what remains. Every failure is a finding (new coupling); the script itself is not the removal command. CI runs it as the `demo-strip-measure` job.

## Key elements

- **`SCRATCH`** — Constant; the scratch copy lives under `os.tmpdir()/demo-strip-measure`, deliberately outside `REPO_ROOT` to avoid `fs.cpSync` source-inside-destination errors.
- **`Check` / `CHECKS`** — Interface and ordered list of the four commands run after removal: `regenerate` (with `--no-sync`), `ts-check`, `test:cross-cutting`, `docs:build`.
- **`Recipe`** — Interface with `apply()` (mutates the scratch tree) and `describe()` (human-readable summary for the report).
- **`runInScratch`** — Runs a command in the scratch tree; **throws** on failure because a recipe that can't apply is a broken measurement, not a finding.
- **`RECIPES`** — Map keyed by the `--recipe` CLI value. `shop` shells out to `scripts/scaffold/demo-remove.ts` inside the scratch copy; `locales` calls `removeModules` directly.
- **`run`** — Runs a single `Check`; **never throws** — a failing check *is* the measurement result.
- **`recipeName` / `recipe`** — Parses `--recipe` via `flagValue`, defaults to `shop`, validates against known keys.
- **Main flow** — Announce → `assembleScratchCopy` → `recipe.apply()` → run all checks → print PASS/FAIL summary → set `process.exitCode` (0 or 1).

## Relationships

- **`scripts/cli.ts`** — Imports `flagValue` to read the `--recipe` argument from the CLI.
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` as the source directory for the scratch copy and for resolving demo module names.
- **`scripts/scaffold/demo-remove-modules.ts`** — Imports `removeModules`, used directly by the `locales` recipe.
- **`scripts/testing/demo-module-names.ts`** — Imports `readDemoModuleNames` to enumerate shop/example modules for the `shop` recipe's description string.
- **`scripts/testing/scratch-copy.ts`** — Imports `assembleScratchCopy` (builds the temp copy) and `runIn` (executes commands inside it); used by both `runInScratch` and `run`.

## Notes

- **Throws vs. returns:** `runInScratch` throws on failure (recipe application must succeed to be a valid measurement); `run` returns a boolean (check failure is the data point). Confusing the two inverts the script's purpose.
- **`process.exitCode`, not `process.exit()`:** Lets `console.info` output flush before the process ends. The exit code is what CI's job square reads.
- **`shop` recipe delegation:** Invokes `npx tsx scripts/scaffold/demo-remove.ts` *inside* the scratch copy so that relative paths resolve to the scratch root, not the real checkout.
- **`regenerate --no-sync`:** The first check deliberately skips network sync to keep the measurement local and deterministic.
- **Unknown recipe is a hard error:** Lists valid names in the message; there is no "run all recipes" mode in this script.
