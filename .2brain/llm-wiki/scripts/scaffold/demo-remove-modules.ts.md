---
source: scripts/scaffold/demo-remove-modules.ts
sha256: 3b83400e6cff83398abd1f29d918053f5d9dd508eb53b0288ef0373492e5b729
generated_at: 2026-10-14T14:31:11.584253+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-modules.ts

## Purpose

General-purpose module removal from a source tree. Given a list of module folder names, it deletes the folders, strips their registry entries, shared authorization references, owned ops scripts, test doubles, scenario entries, and residue tests. It is module-agnostic (doesn't know *which* modules), so both the shop-removal flow and the locale-strip flow share the exact same sequence, preventing drift between the two.

## Key elements

- **`removeModules(repoRoot, names): RemovalNote[]`** — the sole export. Orchestrates eight sub-operations in a fixed order and returns one `RemovalNote` per edit, in execution order.

## Relationships

- **`demo-remove-authorization.ts`** — provides `readRemovedAuthorization`, `stripRoleGrants`, `stripConformanceCases`. The authorization read runs *first* (before folders vanish); the two strip calls run near the end, consuming the authorization data captured earlier.
- **`demo-remove-registry.ts`** — provides `removeModuleFolders`, `removeShopOwnedOpsScripts`, `stripModuleRegistry`, and the `RemovalNote` type used as the return element.
- **`demo-remove-scenarios.ts`** — provides `stripScenarioModuleEntries` and `stripModuleDoubles` (test-double cleanup).
- **`demo-remove-tests.ts`** — provides `removeResidueTests`, called last.
- **`demo-remove.ts`** — caller for `group: shop` modules; performs additional shop-specific work (catalogue, scenarios) after `removeModules` returns.
- **`measure-demo-strip.ts`** — caller for `locales` modules in its second recipe.

## Notes

- **Ordering invariant:** `readRemovedAuthorization` must execute before `removeModuleFolders`, because permission keys are read from fragments inside the module folders being deleted. Reordering the array would silently break authorization stripping.
- The `names` parameter is typed `readonly string[]`; callers pass immutable arrays.
- The function is deliberately named "modules" (not "shop") so the locale-strip caller reads naturally; shop-specific concerns are handled *outside* this file by `demo-remove.ts`.
