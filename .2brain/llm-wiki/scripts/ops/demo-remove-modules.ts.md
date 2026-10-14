---
source: scripts/ops/demo-remove-modules.ts
sha256: 3b83400e6cff83398abd1f29d918053f5d9dd508eb53b0288ef0373492e5b729
generated_at: 2026-10-14T07:21:26.073280+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove-modules.ts

## Purpose

Orchestrates the module-agnostic part of removing modules from the tree: deleting their folders, stripping their registry entries, removing shared authorization references, deleting owned ops scripts, test doubles, and residue tests. It exists so that two callers (`demo-remove.ts` for `group: shop` modules, `measure-demo-strip.ts` for `locales`) share one implementation and cannot drift apart.

## Key elements

- **`removeModules(repoRoot, names): RemovalNote[]`** — the sole export. Takes a checkout path and a list of module folder names, performs all removal steps in a fixed order, and returns one note per edit in the order they were made.

## Relationships

- **`demo-remove-authorization.ts`** — provides `readRemovedAuthorization` (read permission keys *before* folders are deleted), `stripRoleGrants`, and `stripConformanceCases`.
- **`demo-remove-registry.ts`** — provides `removeModuleFolders`, `stripModuleRegistry`, `removeShopOwnedOpsScripts`, and the `RemovalNote` type.
- **`demo-remove-scenarios.ts`** — provides `stripModuleDoubles` and `stripScenarioModuleEntries`.
- **`demo-remove-tests.ts`** — provides `removeResidueTests`.
- **`demo-remove.ts`** — upstream caller; invokes `removeModules` for every `group: shop` module, then handles shop-specific work (catalogue, scenarios).
- **`measure-demo-strip.ts`** — upstream caller; invokes `removeModules` with `locales` for its second recipe.

## Notes

- **Order is load-bearing:** `readRemovedAuthorization` must run *before* `removeModuleFolders` because permission keys are read from each module's own fragment, which lives inside the folder being deleted. Reordering the array in `removeModules` will silently lose authorization data.
- The function is deliberately a flat, linear pipeline (no branching per module), so adding a new removal step means appending one call to the returned array.
