---
source: scripts/scaffold/demo-remove-modules.ts
sha256: f373fcdc2a658721af1d3e53bea20d45d4e8f7c784925d886f105dda1619a009
generated_at: 2026-11-08T02:58:22.758989+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-modules.ts

## Purpose

Orchestrates the module-agnostic half of removing modules from a checkout: deleting their folders, stripping their registry entries, removing shared authorization grants, alert rules, validation labels, scenario files, and residue tests. It exists so the shop-specific removal script (`demo-remove.ts`) can delegate the "which files to touch" logic and focus on the shop-only catalogue and scenario work.

## Key elements

- **`removeModules(repoRoot: string, names: readonly string[]): RemovalNote[]`** — The single export. Reads authorization keys, metrics, and request fields from the target modules' files *before* deleting those folders, then executes the removal steps in a fixed order and returns one `RemovalNote` per edit.

## Relationships

- **`./demo-remove-registry`** — Provides `removeModuleFolders`, `stripModuleRegistry`, and the `RemovalNote` type; handles folder deletion and the registry line that names the modules.
- **`./demo-remove-authorization`** — Provides `readRemovedAuthorization`, `stripRoleGrants`, `stripConformanceCases`; reads permission keys from module files and then strips them from shared conformance/role files.
- **`./demo-remove-alert-rules`** — Provides `readRemovedMetrics`, `stripAlertRules`; reads metric names from module files and removes their alert rules.
- **`./demo-remove-validation-labels`** — Provides `readRemovedFields`, `stripValidationLabels`; reads request-field names and removes validation labels used only by those fields.
- **`./demo-remove-scenarios`** — Provides `removeScenarioModuleFiles`; deletes scenario files and test doubles owned by the target modules.
- **`./demo-remove-tests`** — Provides `removeResidueTests`; removes tests that reference the removed modules.
- **`./demo-remove.ts`** — The caller; invokes `removeModules` with every `group: shop` module, then performs the remaining shop-specific removal (catalogue, scenarios).

## Notes

- **Read-before-delete ordering is load-bearing.** The authorization keys, metrics, and request fields are read from the modules' own files, so those reads must complete before `removeModuleFolders` runs. Reordering the steps in the returned array would break the reads.
- **Registries that *list* the removed files are intentionally NOT edited here.** They are rebuilt by `npm run regenerate`, which `regenerate` invokes. Do not add manual registry edits to this function.
- The file is a `@module` (no default export); consumers import the named `removeModules` binding.
- `names` is `readonly string[]` — callers may pass a literal array or a `ReadonlyArray`.
