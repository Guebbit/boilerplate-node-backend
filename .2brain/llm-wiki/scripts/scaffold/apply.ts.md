---
source: scripts/scaffold/apply.ts
sha256: a3fb503b267168acea0eb6a38edd7494891feb2d58fc663f46a8cfa51e213867
generated_at: 2026-11-08T02:57:34.925942+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/apply.ts

## Purpose

The I/O half of the module scaffolder. Given a fully computed plan (produced by the pure sibling files), it either refuses to proceed—returning every reason the scaffold would collide with existing state—or writes the planned files and central edits to disk. It exists to keep all disk-touching logic isolated so that tests can point it at a scratch directory and the pure planning logic stays unit-testable without filesystem access.

## Key elements

- **`REGISTRY`** (const) – Repo-relative path of the central module registry (`src/modules.ts`), used for both the refusal check and the central-edit write.
- **`takenSchemaNames(root)`** – Scans every module under `src/modules` for an `openapi.yaml` fragment and returns the set of all declared schema names. Used to detect cross-module name collisions.
- **`refusalsFor(root, plan)`** (exported) – Returns an array of human-readable strings explaining why the scaffold must not proceed: directory exists, docs file exists, already registered, or schema-name collision.
- **`writePlanned(root, relative, content, formatText)`** – Creates parent directories and writes a single planned file after running it through the injected `formatText` function.
- **`applyScaffold(root, options, formatText)`** (exported) – The main entry point. Calls `planModule`, checks `refusalsFor` (throws with all reasons joined if any), computes all central edits up-front, then writes planned files followed by central edits. Returns the `ScaffoldPlan` that was written.

## Relationships

- **`scripts/scaffold/plan.ts`** – Source of `planModule`, `collidingSchemas`, and the `ScaffoldPlan` type. All decisions about *what* to write live there; this file only executes.
- **`scripts/scaffold/central-edits.ts`** – Provides `centralEdits(plan.names)`, which yields the list of edits (e.g., registry line insertions) applied after the module files.
- **`scripts/scaffold/registry.ts`** – `isRegistered` is used during the refusal check to see whether the kebab-case name already appears in `src/modules.ts`.
- **`scripts/scaffold/format-text.ts`** – Supplies the `FormatText` type. The concrete formatter is injected by the caller so this module never imports Prettier directly.
- **`scripts/scaffold/options.ts`** – Provides the `ScaffoldOptions` type consumed by `applyScaffold`.
- **`scripts/modules-on-disk.ts`** – `modulesWith` lists module folders that contain a given file (`openapi.yaml`), enabling the schema-name collision scan.
- **`scripts/contracts/fragments.ts`** – `readModuleFragment` reads a module's `openapi.yaml` to extract its declared schema components.
- **`tests/unit/scripts/scaffold/apply.test.ts`** – Unit-tests for the refusal logic and the write path, using a scratch `root` and an identity `formatText`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** – Exercises broader CI-wave behavior that may invoke or depend on the scaffolding pipeline.

## Notes

- **Atomicity-by-construction:** All central edits are read, transformed, and formatted *before* any file is written. If `formatText` throws mid-batch, the tree is left untouched rather than half-scaffolded.
- **No Prettier import here:** `formatText` is a required parameter with no default. In production the caller wires in a real formatter; in tests an identity function is passed. This keeps the module free of a Prettier dependency.
- **Refusal is all-or-nothing:** `applyScaffold` collects every problem, then throws once with all reasons newline-joined. It never writes a file after finding even one refusal.
- **`root` is always the first parameter** in every function, making the entire file relocatable for test fixtures without monkey-patching `fs`.
