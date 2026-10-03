---
source: scripts/scaffold/apply.ts
sha256: 23f1d164dcce409158ce613088209675ed9452c380cf8ca554490297bff491a9
generated_at: 2026-10-01T12:38:29.339266+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/apply.ts

## Purpose

The I/O half of the module scaffolder. It performs the only disk-touching work in the scaffold pipeline: checking whether a scaffold is already present (refusals), collecting schema names from existing `openapi.yaml` files, and writing the planned files plus central-edit patches. All pure logic (naming, planning, collision detection) lives in sibling modules; this file is kept thin so tests can redirect `root` to a scratch directory.

## Key elements

- **`refusalsFor(root, plan)`** (exported) — Returns a list of human-readable refusal strings (existing directory, existing docs file, already-registered kebab name, colliding schema names). An empty list means the scaffold may proceed.
- **`applyScaffold(root, options, formatText)`** (exported) — Main entry point. Plans the module, throws if any refusal exists, computes all central edits *before* writing anything (all-or-nothing), then writes planned files and edits. Returns the `ScaffoldPlan` that was written.
- **`takenSchemaNames(root)`** (private) — Reads every `src/modules/*/openapi.yaml`, extracts `components.schemas` keys, and returns them as a `Set<string>` for collision checking.
- **`writePlanned(root, relative, content, formatText)`** (private) — Creates parent directories, formats content via the injected `formatText`, and writes a single file.
- **`FragmentShape`** — Minimal interface describing the slice of an OpenAPI YAML document this file cares about (only `components.schemas`).
- **`REGISTRY`** — Constant `'src/modules.ts'`, the repo-relative path of the central registry.

## Relationships

- **`scripts/scaffold/plan.ts`** — Imports `planModule`, `collidingSchemas`, and the `ScaffoldPlan` type. `applyScaffold` calls `planModule` to produce the file list, and `refusalsFor` calls `collidingSchemas` against the taken-names set.
- **`scripts/scaffold/options.ts`** — Imports the `ScaffoldOptions` type used as the options argument to `applyScaffold`.
- **`scripts/scaffold/central-edits.ts`** — Imports `centralEdits`, which returns the list of file edits (registry line, module registration) computed from the planned names.
- **`scripts/scaffold/format-text.ts`** — Imports the `FormatText` type. The formatter is injected into `applyScaffold` rather than loaded internally, keeping this file Prettier-free and testable with an identity function.
- **`scripts/scaffold/registry.ts`** — Imports `isRegistered` to check whether a kebab-case name already appears in `src/modules.ts`.
- **`tests/unit/scripts/scaffold/apply.test.ts`** — Unit-tests the two exported functions (`refusalsFor`, `applyScaffold`) against a scratch `root`.

## Notes

- **All-or-nothing write order.** All central edits are computed and formatted *before* any `writePlanned` call, so a shape change mid-flight cannot leave the tree half-scaffolded.
- **No Prettier import here.** `formatText` is a required parameter with no default; this file deliberately never loads a formatter itself. Tests pass an identity function.
- **`root` is the single source of truth for paths.** Every file access is `path.join(root, …)`, which is what lets tests point at a temporary directory without touching the real repo.
- **`takenSchemaNames` reads the disk on every call** (readdir + readFileSync per module). This is intentional: it reflects the live filesystem rather than a cached snapshot.
