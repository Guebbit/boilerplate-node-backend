---
source: scripts/scaffold/demo-remove-modules.ts
sha256: 3e5c6bfa9b68238defd86ffc48fdfc58addc21cf60c6ba1fd77d7e5d3a1b60c4
generated_at: 2026-10-15T09:45:42.924115+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-modules.ts

## Purpose

Single orchestration point for removing a set of modules from the repo tree. It coordinates the cross-cutting removal steps (folders, registry, authorization, alert rules, validation labels, test doubles, residue tests) so that callers (`demo-remove.ts`, `measure-demo-strip.ts`) share one implementation and cannot drift apart.

## Key elements

- **`removeModules(repoRoot, names): RemovalNote[]`** — the sole export. Reads permission keys, metrics, and request fields from the target modules *before* deleting their folders, then performs the deletion and all downstream stripping in a fixed order. Returns one `RemovalNote` per edit, in execution order.

## Relationships

- **`demo-remove-registry.ts`** — provides `removeModuleFolders`, `stripModuleRegistry`, `removeShopOwnedOpsScripts`, and the `RemovalNote` type used as the return element.
- **`demo-remove-authorization.ts`** — provides `readRemovedAuthorization` (pre-delete read) plus `stripRoleGrants` and `stripConformanceCases` (post-delete edits).
- **`demo-remove-alert-rules.ts`** — provides `readRemovedMetrics` (pre-delete read) and `stripAlertRules` (post-delete edit).
- **`demo-remove-validation-labels.ts`** — provides `readRemovedFields` (pre-delete read) and `stripValidationLabels` (post-delete edit).
- **`demo-remove-scenarios.ts`** — provides `stripModuleDoubles` and `stripScenarioModuleEntries`.
- **`demo-remove-tests.ts`** — provides `removeResidueTests`, the final cleanup step.
- **`demo-remove.ts`** — upstream caller; invokes `removeModules` with all `group: shop` modules, then performs shop-specific work (catalogue, scenarios) itself.
- **`measure-demo-strip.ts`** — upstream caller; invokes `removeModules` with `locales` for its second recipe.

## Notes

- **Ordering is intentional and not refactoring-safe.** The three `readRemoved*` calls must complete before `removeModuleFolders` runs, because they read from the module folders themselves. Moving the folder deletion above them breaks the logic silently.
- The function is deliberately generic in *which* modules it removes; it carries no shop-specific logic. Any shop-only work stays in `demo-remove.ts`.
- All steps return `RemovalNote[]` (or a single `RemovalNote`), and the results are concatenated into one flat array — callers can iterate uniformly without knowing which sub-step produced a given note.
