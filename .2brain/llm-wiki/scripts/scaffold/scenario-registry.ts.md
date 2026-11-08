---
source: scripts/scaffold/scenario-registry.ts
sha256: 09e1155ca7c07c6dcc19fcd5f9817f3e2968d6e6ef58460cd2e15e4c662c07da
generated_at: 2026-11-08T03:00:52.464918+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/scenario-registry.ts

## Purpose

Generates four "registry" files (`*.generated.ts`) by scanning the `scenarios/` file tree, so that adding or removing a module/scenario is just adding or deleting a file—no hand-maintained import list to keep in sync. The registries collect one named export per file (`shopModule`, `scenario`, `registerDouble`, `installLever`) into a single object or function call per category.

## Key elements

- **`GeneratedFile`** – Interface: `{ file, content }`, the shape of one generated output.
- **`FIXTURE_REGISTRY` / `SCENARIO_REGISTRY` / `DOUBLES_REGISTRY` / `LEVERS_REGISTRY`** – Constants holding the repo-relative paths of the four generated files.
- **`declares(file, exportName)`** – Regex check that a file contains `export const <name>` at top level. Never parses the body.
- **`identifier(name)`** – Converts kebab-case to camelCase for use as a JS identifier.
- **`namesIn(folder, pattern)`** – Returns alphabetically-sorted captured names from file names in a folder (empty if folder is missing).
- **`renderCollection(entries, constName, description)`** – Emits the `import … as …` lines and the `export const <constName> = { … }` declaration shared by the fixture and scenario registries.
- **`renderFixtureRegistry` / `renderScenarioRegistry` / `renderDoublesRegistry` / `renderLeversRegistry`** – One per generated file; scan the relevant directory, filter by the expected export, and return the full file text (header + imports + body).
- **`renderScenarioRegistries(repoRoot, format)`** – Orchestrates all four renderers, pipes each through the injected `FormatText` formatter, returns `Promise<GeneratedFile[]>`.
- **`writeScenarioRegistries(repoRoot, format)`** – Renders, writes changed files to disk, returns the list of paths whose content actually changed.
- **`staleScenarioRegistries(repoRoot, format)`** – Renders and compares against disk without writing; returns paths that are missing or differ (for `--check`).

## Relationships

- **`scripts/scaffold/format-text.ts`** – Provides the `FormatText` type imported here; the formatter is injected as a parameter rather than imported directly, keeping Prettier out of the Jest environment.
- **`scripts/docs/generate-scenario-registries.ts`** – The CLI runner that calls `writeScenarioRegistries` / `staleScenarioRegistries` (via `npm run regenerate` / `--check`).
- **`tests/unit/scripts/scaffold/scenario-registry.test.ts`** – Unit-tests the render and write functions; the `format` parameter exists specifically so this test can supply a no-op formatter instead of loading Prettier.
- **`scripts/scaffold/demo-remove.ts`** – Scaffolds the removal of a demo module; the generated registries it relies on are produced by this file, so a removal workflow deletes source files then regenerates.

## Notes

- The `format` parameter is deliberately injected (not imported) so that unit tests under Jest never pull in Prettier. Passing `formatWithRepoConfig` from the CLI is the caller's responsibility.
- `renderScenarioRegistry` **throws** if a `*.scenario.ts` file is found without a top-level `export const scenario`; the fixture/doubles/levers renderers silently skip non-conforming files.
- The `HEADER` constant prepended to every generated file carries the "do not edit" warning and the `npm run regenerate` instruction.
- `namesIn` uses `String.raw`-free regexes with negative lookaheads (e.g. `(?!.*\.scenario)`) to distinguish `<module>.ts` from `<name>.scenario.ts` in the same directory.
- `writeScenarioRegistries` returns only the paths that **changed**, enabling callers to report or gate on actual diffs.
