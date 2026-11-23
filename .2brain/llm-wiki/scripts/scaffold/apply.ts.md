---
source: scripts/scaffold/apply.ts
source_sha256: a06cf32cda9dc1c8603859359ddc0e7abbae80f5be91ad579d56d0d978df4bc7
context_sha256: afdc47cdb1851c3543d0120ade8f6fcb1d927f32f0e124522606cc3bca1af8ed
generated_at: 2026-11-22T02:13:43.617657+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/apply.ts

## Purpose
The I/O half of the module scaffolder. It refuses to scaffold when the module already exists or its schema names collide, then writes the planned files and applies the central registry edits. All decisions live in the pure neighbouring files. This file only touches the disk, under a caller-supplied `root`, so tests can point it at a scratch directory.

## Key elements
- `refusalsFor(root, plan)` (exported): returns a list of human-readable reasons the scaffold can't proceed. It checks these in order:
  - `src/modules/<kebab>/` already exists.
  - `docs/modules/<kebab>.md` already exists.
  - The module is already registered in the registry file (`src/modules.ts`).
  - Schema names collide with another module's contract. The message suggests `--entity <Name>`.
- `applyScaffold(root, options, formatText)` (exported, async): plans the module, throws an `Error` listing every refusal joined by newlines, computes all central edits, then writes the planned files and the edits. It returns the `ScaffoldPlan`.
- `takenSchemaNames(root)` (internal): collects the schema names under `components.schemas` from every module's contract fragment.
- `writePlanned(...)` (internal): creates the parent folder, formats the content, and writes the file.
- `REGISTRY`: the constant `'src/modules.ts'`.

## Relationships
- `./options`: supplies the `ScaffoldOptions` type.
- `./plan`: provides `planModule` (options → plan), `collidingSchemas`, and the `ScaffoldPlan` type.
- `./central-edits`: `centralEdits` returns the edits to existing central files. Each has a `path` and an `apply(text)` function.
- `./registry`: `isRegistered` checks whether the module is already registered.
- `./format-text`: provides the `FormatText` type. The formatter is injected, not imported.
- `../modules-on-disk` (`modulesWith`): enumerates module folders that contain a contract fragment file.
- `../contracts/fragments` (`readModuleFragment`): reads each module's contract fragment.
- `scripts/scaffold/scaffold-module.ts` is a graph neighbour. It is presumably the entry point that calls `applyScaffold`, but the call is not visible in this file.
- `tests/unit/scripts/scaffold/apply.test.ts` exercises this file. `tests/unit/scripts/mutation/ci/waves.test.ts` is also a graph neighbour, and this file does not show how it relates.

## Notes
- **Nothing is written on a refusal.** Refusals are checked first, and all central edits are computed, formatted and read from disk before any write. A central file that has changed shape therefore leaves the tree untouched rather than half-scaffolded.
- **Atomicity is limited to the compute phase.** The write loops themselves are not transactional.
- **`formatText` is required, not defaulted**, so this file never loads Prettier. Tests pass an identity function.
- **Write order:** the planned new files are written first, then the central edits.
