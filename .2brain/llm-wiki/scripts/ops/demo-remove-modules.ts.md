---
source: scripts/ops/demo-remove-modules.ts
sha256: af700165afbf838cd869eba2d5c6c3d3ddc972f6d5a8777273add2bfb8f919ca
generated_at: 2026-10-01T12:34:47.150272+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove-modules.ts

## Purpose

Generic "remove a set of module folders from the checkout" routine. It handles every step that is module-agnostic—deleting folders, stripping registry entries, cleaning shared authorization files, removing owned ops scripts, pruning scenario entries, and deleting residue tests. It exists so that both the shop-specific `demo-remove.ts` flow and the `measure-demo-strip.ts` locale recipe share one implementation and cannot drift apart.

## Key elements

- **`removeModules(repoRoot, names): RemovalNote[]`** — the sole export. Orchestrates all removal steps in a fixed order and returns one `RemovalNote` per edit (order preserved).

## Relationships

- **`demo-remove-authorization.ts`** — provides `readRemovedAuthorization` (called first, before folders are deleted, because permission keys are read from each module's own fragment), `stripRoleGrants`, and `stripConformanceCases`.
- **`demo-remove-registry.ts`** — provides `removeModuleFolders`, `stripModuleRegistry`, `removeShopOwnedOpsScripts`, and the shared `RemovalNote` type.
- **`demo-remove-scenarios.ts`** — provides `stripScenarioModuleEntries` for cleaning scenario definitions that reference the removed modules.
- **`demo-remove-tests.ts`** — provides `removeResidueTests` for deleting tests that depend on the removed modules.
- **`demo-remove.ts`** (caller) — invokes `removeModules` with every `group: shop` module, then performs shop-specific work (demo catalogue, scenarios) on top.
- **`measure-demo-strip.ts`** (caller) — invokes `removeModules` with the `locales` set for its second measurement recipe.

## Notes

- **Order is load-bearing:** `readRemovedAuthorization` runs before `removeModuleFolders` because it reads permission keys from each module's own fragment; once the folders are gone the read would fail.
- The file is marked `@module`—it has no side effects and no default export; the only entry point is the named `removeModules` binding.
- `names` is typed `readonly string[]`, so callers can pass a `const` tuple or `as const` array without a cast.
