---
source: scripts/scaffold/scenario-registry.ts
sha256: 09e1155ca7c07c6dcc19fcd5f9817f3e2968d6e6ef58460cd2e15e4c662c07da
generated_at: 2026-10-29T01:44:02.859929+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/scenario-registry.ts

## Purpose

Generates four "registry" files from the directory tree so that adding or removing a module only requires adding or deleting source files. On the next regeneration the registries pick up what's there and drop what's gone, eliminating the need to hand-edit a list that would drift out of sync.

## Key elements

- **`FIXTURE_REGISTRY` / `SCENARIO_REGISTRY` / `DOUBLES_REGISTRY` / `LEVERS_REGISTRY`** – repo-relative paths of the four `.generated.ts` outputs.
- **`renderFixtureRegistry(repoRoot)`** – scans `scenarios/` for non-scenario `.ts` files that export `shopModule`; emits imports + a `shopModuleFixtures` object.
- **`renderScenarioRegistry(repoRoot)`** – scans for `*.scenario.ts` files; **throws** if one is missing its required `scenario` export.
- **`renderDoublesRegistry(repoRoot)`** – scans `scenarios/support/doubles/<module>/register.ts` for a `registerDouble` export; emits a `registerModuleDoubles()` function.
- **`renderLeversRegistry(repoRoot)`** – same pattern for `levers.ts` / `installLever`; emits `installModuleLevers(app)`.
- **`renderScenarioRegistries(repoRoot, format)`** *(exported)* – renders all four registries, pipes each through the supplied `FormatText`, returns `GeneratedFile[]`.
- **`writeScenarioRegistries(repoRoot, format)`** *(exported)* – writes changed files, creates parent dirs, returns the list of paths that actually changed.
- **`staleScenarioRegistries(repoRoot, format)`** *(exported)* – dry-run: returns paths whose content differs from (or is missing) what the tree dictates. Used by `--check`.
- **`declares(file, exportName)`** – line-regex check (`^export const <name>\b`, multiline) rather than a full parse.
- **`identifier(name)`** – converts kebab-case folder/file names to camelCase for use as JS identifiers.
- **`renderCollection(entries, constName, description)`** – shared helper that produces the `import … as …` lines and the object-literal declaration.

## Relationships

- **`scripts/scaffold/format-text.ts`** – supplies the `FormatText` type; the formatter is injected as a parameter rather than imported so that Jest unit tests can stub it without loading Prettier.
- **`scripts/docs/generate-scenario-registries.ts`** – CLI entry point that calls `writeScenarioRegistries` / `staleScenarioRegistries` to run or check the regeneration.
- **`tests/unit/scripts/scaffold/scenario-registry.test.ts`** – unit tests for the render and stale-check functions.
- **`scripts/audit/code-shape/scripts/shallow-candidates.ts`** – audit tooling that may inspect the shape of generated registries.
- **`scripts/scaffold/demo-remove.ts`** – consumes the generated registries to know which modules/doubles/levers to tear down.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** – CI mutation wave that exercises the generated-file pipeline.

## Notes

- The formatter is a **parameter**, not an import. The module docblock explicitly states this is so Jest tests can substitute a no-op formatter without pulling in Prettier.
- `declares` only checks for a top-level `export const <name>` line; it does not parse the file. If a module renames or restructures that export, regeneration silently drops it (or throws, for the scenario registry).
- The fixture registry regex explicitly **excludes** files matching `*.scenario.ts` to avoid double-collecting.
- `writeScenarioRegistries` skips the write when content is identical, so timestamps of unchanged files are not bumped.
- Every generated file starts with a `@module` banner saying "GENERATED … do not edit."
- The doubles and levers registries scan **subdirectories** (one per module), not flat files, so the module boundary is the folder name.
