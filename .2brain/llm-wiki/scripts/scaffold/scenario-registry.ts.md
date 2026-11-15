---
source: scripts/scaffold/scenario-registry.ts
sha256: f227d560719af723f6a5a604ba424f034638f46364c0331f2ea48b27e5c0fdde
generated_at: 2026-11-14T17:42:20.308225+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/scenario-registry.ts

## Purpose

Generates four registry files (`shop-modules.generated.ts`, `scenarios.generated.ts`, `modules.generated.ts`, `levers.generated.ts`) by scanning the `scenarios/` file tree for files that follow naming and export conventions. This eliminates hand-maintained lists: adding or deleting a module is just adding or deleting files, and the next regeneration reflects the change.

## Key elements

- **`FIXTURE_REGISTRY` / `SCENARIO_REGISTRY` / `DOUBLES_REGISTRY` / `LEVERS_REGISTRY`** — repo-relative paths of the four generated files.
- **`declares(file, exportName)`** — regex check (not a full parse) that a file contains a top-level `export const <name>`.
- **`foldersDeclaring(dir, fileName, exportName)`** — returns alphabetically-sorted doubles subfolder names whose inner file declares the expected export; tolerates a folder having only one of its two files.
- **`identifier(name)`** — kebab-case → camelCase for use as an import alias.
- **`namesIn(folder, pattern)`** — extracts captured names from matching file names in a directory.
- **`renderCollection(entries, constName, description)`** — emits `import { x as y }` lines plus the `export const <name> = { … }` object.
- **`renderFixtureRegistry` / `renderScenarioRegistry` / `renderDoublesRegistry` / `renderLeversRegistry`** — each produces the full file body (header + imports + declaration) for one registry.
- **`renderScenarioRegistries(repoRoot, format)`** — renders all four, pipes each through the injected `FormatText` formatter, returns `Promise<GeneratedFile[]>`.
- **`writeScenarioRegistries(repoRoot, format)`** — writes only files whose content changed; returns the changed paths.
- **`staleScenarioRegistries(repoRoot, format)`** — compares rendered output to on-disk files; returns paths that are stale or missing (used by `--check`).

## Relationships

- **`scripts/scaffold/format-text.ts`** — exports the `FormatText` type injected into `renderScenarioRegistries`, `writeScenarioRegistries`, and `staleScenarioRegistries`. The formatter is passed in (rather than imported) so unit tests can avoid loading Prettier under Jest.
- **`scripts/docs/generate-scenario-registries.ts`** — the CLI entry point that invokes `writeScenarioRegistries` (or `staleScenarioRegistries` for `--check`).
- **`scripts/scaffold/demo-remove.ts`** — after deleting a module's files, the next registry regeneration drops the corresponding entry; this module provides the regeneration logic.
- **`tests/unit/scripts/scaffold/scenario-registry.test.ts`** — unit tests for the render and write functions.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises registry generation in a CI mutation-wave context.

## Notes

- Detection is purely convention-based: a file is picked up only if its name matches the expected pattern **and** it declares the expected `export const` via a simple regex. No module-system resolution or full AST parsing occurs.
- `renderScenarioRegistry` **throws** if a `.scenario.ts` file is found by name but does not declare `export const scenario`; the fixture and doubles/levers renderers silently skip non-conforming entries instead.
- All generated files open with a `@module` header stating they are generated and must not be edited.
- `renderScenarioRegistries` wraps its body in `Promise.resolve().then(…)` so that a synchronous read failure rejects the promise rather than escaping as an uncaught throw.
- The `format` parameter is always the Prettier-wrapped `formatWithRepoConfig` in production; tests substitute a no-op or simple formatter.
