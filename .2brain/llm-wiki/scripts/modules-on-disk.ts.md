---
source: scripts/modules-on-disk.ts
source_sha256: d65a2046f2869acc55c00bccd34073a88980455085b9fa84ff24953966703d09
context_sha256: 558eb8c62336f60cbb1a95484ed735870a26019c8b5a660d43b1abb5dd2e15a3
generated_at: 2026-11-22T02:07:18.222467+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/modules-on-disk.ts

## Purpose
Single source of truth for where the repo and its modules live on disk. Build steps that need "each module that ships X" (a contract fragment, a probe list, a descriptor) call this file instead of each walking `src/modules` in their own way.

## Key elements
- `REPO_ROOT`: absolute path of the repo root, resolved one level up from `scripts/` (via `__dirname`).
- `MODULES_ROOT`: the real `src/modules` directory (`REPO_ROOT/src/modules`).
- `modulesWith(modulesRoot, file)`: lists the module folders (direct subdirectories of `modulesRoot`) that contain `file`, where `file` may be a file or folder relative to the module (e.g. `openapi.yaml`, `tests`). It returns the names sorted alphabetically.

## Relationships
The listed neighbors are scripts under `scripts/contracts/` (bundle builders, AsyncAPI and breaking-change checks, and generators for error codes, permission vocabulary, redirect query, request content types and shared rule schemas) and `scripts/audit/code-shape/scripts/generate-shallow-candidates.ts`. They sit around this file in the dependency graph as consumers of the module-discovery helpers. The file imports only `node:fs` and `node:path`, so it has no dependencies on those scripts.

## Notes
- `modulesWith` takes the root as a parameter rather than assuming `MODULES_ROOT`, so tests can point it at a scratch tree.
- Results are alphabetical. Callers that need a narrative order pass them to `orderSections` (referenced in the doc comment, not defined here).
- Only directories are considered. Loose files in `modulesRoot` are ignored.
- Existence is checked with `existsSync`, so the match works for both files and folders.
