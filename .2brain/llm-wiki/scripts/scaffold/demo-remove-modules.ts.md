---
source: scripts/scaffold/demo-remove-modules.ts
source_sha256: f373fcdc2a658721af1d3e53bea20d45d4e8f7c784925d886f105dda1619a009
context_sha256: cc0f34423ae2b7f3fca16db650672d74551466631301644d9ee85fe2e91378e7
generated_at: 2026-11-22T02:14:33.854796+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/demo-remove-modules.ts

## Purpose
Generic "remove these modules from the tree" step of the demo-removal scaffold. It handles everything that doesn't depend on *which* modules are removed: their folders, the registry line naming them, shared authorization files, alert rules on their metrics, validation labels only their fields used, scenario files, test doubles and residue tests. Registries that listed the removed files are not edited here. `npm run regenerate` rebuilds them, and `regenerate` runs that.

## Key elements
- `removeModules(repoRoot, names)` is the only export. It edits the checkout at `repoRoot` for the module folders in `names` and returns a `RemovalNote[]`, one note per edit in the order made.
  - **Read phase:** it first collects `removedAuthorization`, `removedMetrics` and `removedFields` from the modules' own files.
  - **Edit phase:** it then runs, in order:
    1. `removeModuleFolders`
    2. `stripModuleRegistry`
    3. `removeScenarioModuleFiles`
    4. `stripRoleGrants`
    5. `stripConformanceCases`
    6. `stripAlertRules`
    7. `stripValidationLabels`
    8. `removeResidueTests`

## Relationships
This file only orchestrates. Each step is delegated to a sibling module:
- `demo-remove-registry.ts`: `removeModuleFolders`, `stripModuleRegistry` and the `RemovalNote` type.
- `demo-remove-authorization.ts`: `readRemovedAuthorization`, `stripRoleGrants` and `stripConformanceCases`.
- `demo-remove-alert-rules.ts`: `readRemovedMetrics` and `stripAlertRules`.
- `demo-remove-validation-labels.ts`: `readRemovedFields` and `stripValidationLabels`.
- `demo-remove-scenarios.ts`: `removeScenarioModuleFiles`.
- `demo-remove-tests.ts`: `removeResidueTests`.
- `demo-remove.ts` is the caller. It passes every `group: shop` module, then does the shop-only work (demo catalogue, scenarios).

## Notes
- **Ordering:** the permission keys, metrics and request fields are read from the module files, so all three reads must happen before `removeModuleFolders` deletes them.
- **Scratch copies:** `repoRoot` can be this checkout or a scratch copy.
- **Registries:** generated registries are intentionally left stale and rebuilt by `npm run regenerate`.
