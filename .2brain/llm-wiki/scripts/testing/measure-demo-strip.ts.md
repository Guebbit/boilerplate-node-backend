---
source: scripts/testing/measure-demo-strip.ts
sha256: b8fb95c7b428b7a3d9ee4d5b48db5597225b5f26dedb3f54c54a7693315f24c3
generated_at: 2026-10-29T01:45:27.228129+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/measure-demo-strip.ts

## Purpose

Measures how removable a given module group is by applying a removal **recipe** to a scratch copy of the repository, then running the standard post-removal checks (regenerate, type-check, cross-cutting tests, docs build). A failing check is the *finding*—it identifies residual coupling. This is a measurement harness, not the removal command itself (`demo:remove`); it is invoked via `npm run measure:demo-strip [-- --recipe shop|locales]` and runs as the `demo-strip-measure` CI job.

## Key elements

- **`SCRATCH`** — temp-directory path (`os.tmpdir()/demo-strip-measure`) where the scratch copy is assembled; deliberately outside `REPO_ROOT` to avoid `fs.cpSync` source/destination overlap.
- **`Check`** (interface) — a label, command, and args describing one post-removal verification step.
- **`CHECKS`** — ordered array of four checks: `regenerate`, `ts-check`, `test:cross-cutting`, `docs:build`.
- **`Recipe`** (interface) — `apply()` to perform the removal in the scratch tree, and `describe()` for the report line.
- **`RECIPES`** — map keyed by `--recipe` value; `shop` shells out to `scripts/scaffold/demo-remove.ts` via `npx tsx`, `locales` calls `removeModules` directly.
- **`runInScratch`** — runs a command in the scratch dir and **throws** on failure (a failed recipe application is a broken measurement, not a finding).
- **`run`** — runs one `Check` in the scratch dir and **returns a boolean**; never throws (a failure is the measurement result).
- **Main flow** — resolves recipe name (default `shop`), assembles scratch copy, applies recipe, runs all checks, prints a PASS/FAIL summary, sets `process.exitCode` to 0 or 1.

## Relationships

- **`scripts/cli.ts`** — imports `flagValue` to read the `--recipe` CLI argument.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` as the source for the scratch copy and for resolving demo module names.
- **`scripts/scaffold/demo-remove-modules.ts`** — imports `removeModules`, used by the `locales` recipe to delete the module folder and its registry lines.
- **`scripts/testing/demo-module-names.ts`** — imports `readDemoModuleNames` to enumerate the module names for the `shop` recipe's description string.
- **`scripts/testing/scratch-copy.ts`** — imports `assembleScratchCopy` (copies `REPO_ROOT` into `SCRATCH`) and `runIn` (executes a command in a given directory, returns success boolean).

## Notes

- **Two failure semantics:** `runInScratch` throws if a recipe cannot be applied (the measurement is invalid); `run` returns `false` if a post-removal check fails (the measurement result). Confusing these would mask findings or crash on expected failures.
- **Scratch location:** must be outside the repo tree. A path like `<repo>/tmp/` would make `fs.cpSync` see the destination as a subdirectory of its own source and refuse to copy.
- **Shop recipe indirection:** it does not import the removal logic directly; it shells out to `scripts/scaffold/demo-remove.ts` via `npx tsx` inside the scratch copy, so `__dirname` resolves to the scratch root.
- **`process.exitCode` vs `process.exit()`:** the script sets `exitCode` rather than calling `exit()` so that pending `console` output can flush before the process terminates.
- **All checks always run:** even if `regenerate` fails, `ts-check`, `test:cross-cutting`, and `docs:build` still execute against whatever the failed regenerate left behind, because the aggregate of failures is the useful signal.
