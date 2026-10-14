---
source: scripts/testing/measure-demo-strip.ts
sha256: a7aab5efe552545982561ac84652afb309c7e421e5e18697d894f17af4ec4625
generated_at: 2026-10-14T14:33:29.089227+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/measure-demo-strip.ts

## Purpose

CLI script (`npm run measure:demo-strip`) that measures how cleanly a module can be removed from the repo. It applies a removal **recipe** (`shop` or `locales`) to a throwaway scratch copy of the checkout, then runs `regenerate`, `ts-check`, `test:cross-cutting`, and `docs:build` against the result. Whatever fails is the "punch list" of remaining couplings. It is intentionally report-only (exit code 0/1) and is **not** a merge gate.

## Key elements

- **`CHECKS`** — ordered list of the four commands run against the scratch tree after removal (`regenerate`, `ts-check`, `test:cross-cutting`, `docs:build`).
- **`Recipe`** interface — `{ apply(): void; describe(): string }`; a pluggable way to define "what gets removed."
- **`RECIPES`** — maps CLI `--recipe` names to `Recipe` objects:
  - `shop` — shells out to `npx tsx scripts/scaffold/demo-remove.ts` inside the scratch copy.
  - `locales` — calls `removeModules(SCRATCH, ['locales'])` directly.
- **`runInScratch`** — wrapper around `runIn` that **throws** on failure (a broken recipe application is a measurement error, not a finding).
- **`run`** — runs a single `Check`; never throws (a failing check *is* the measurement).
- **Top-level flow** — parses `--recipe`, assembles the scratch copy, applies the recipe, iterates `CHECKS`, prints a PASS/FAIL summary, sets `process.exitCode`.

## Relationships

- **`scripts/scaffold/demo-remove-modules.ts`** — imports `removeModules`, used by the `locales` recipe to delete the target folder and its registry entries from the scratch tree.
- **`scripts/testing/demo-module-names.ts`** — imports `readDemoModuleNames`, used by the `shop` recipe's `describe()` to enumerate which modules will be removed.
- **`scripts/testing/scratch-copy.ts`** — imports `assembleScratchCopy` (creates the temp copy under `os.tmpdir()`) and `runIn` (executes a command with the scratch directory as CWD).

## Notes

- The scratch directory lives at `os.tmpdir()/demo-strip-measure`, deliberately **outside** the repo tree, because `fs.cpSync` refuses a destination that is a subdirectory of its own source.
- `runInScratch` throws on failure, but `run` does not — the distinction is: a broken *recipe application* invalidates the measurement, whereas a failing *check* is the expected data point.
- `process.exitCode` is used instead of `process.exit()` so pending stdout/stderr can flush before the process terminates.
- The `shop` recipe invokes the real `demo-remove.ts` script by path relative to the scratch root (`__dirname` inside the scratch copy resolves to the scratch root, not this file's location).
- See `docs/theory/strategic-ddd.md#4a-foundation-and-shop` for the strategic context behind measuring removability.
