---
source: scripts/scaffold/demo-remove-modules.ts
sha256: f8d212bfedf9be0badf4d5c0a5c20162c027348e4a624d5c5075130e1483a48a
generated_at: 2026-10-29T01:42:11.938490+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-modules.ts

## Purpose

Orchestrates the module-agnostic portion of a multi-module removal: deleting module folders, stripping their registry entries, shared authorization files, alert rules, validation labels, scenario files, and residual tests. It exists as a single call point so that `demo-remove.ts` (shop modules) and `measure-demo-strip.ts` (locales) perform identical steps and cannot drift apart.

## Key elements

- **`removeModules(repoRoot: string, names: readonly string[]): RemovalNote[]`** — the sole export. Reads permission keys, metrics, and request fields *before* deleting folders (order dependency), then runs the strip/remove functions in a fixed sequence and returns one `RemovalNote` per edit.
- **`RemovalNote`** — imported type from `demo-remove-registry.ts`; the common return shape for every per-edit note.

## Relationships

- **`demo-remove-registry.ts`** — provides `removeModuleFolders`, `stripModuleRegistry`, and the `RemovalNote` type; runs first (folder deletion + registry-line removal).
- **`demo-remove-authorization.ts`** — provides `readRemovedAuthorization` (called before folder removal), `stripRoleGrants`, and `stripConformanceCases`.
- **`demo-remove-alert-rules.ts`** — provides `readRemovedMetrics` (called before folder removal) and `stripAlertRules`.
- **`demo-remove-validation-labels.ts`** — provides `readRemovedFields` (called before folder removal) and `stripValidationLabels`.
- **`demo-remove-scenarios.ts`** — provides `removeScenarioModuleFiles` (deletes scenario files and test doubles owned by the named modules).
- **`demo-remove-tests.ts`** — provides `removeResidueTests` (removes test files that import the deleted modules).
- **`demo-remove.ts`** — upstream caller; invokes `removeModules` for every `group: shop` module before doing shop-specific cleanup.
- **`measure-demo-strip.ts`** — upstream caller; invokes `removeModules` with `locales` as part of its second recipe.

## Notes

- **Read-before-delete ordering is critical.** `readRemovedAuthorization`, `readRemovedMetrics`, and `readRemovedFields` must run before `removeModuleFolders`, because they parse the modules' own source files. Reordering the array literal would silently break the strip steps.
- **Registries that *list* removed files are intentionally not edited here.** They are rebuilt by `npm run regenerate`, which `demo-remove.ts` runs after this function returns.
- The function returns notes in the exact order edits were made; callers may rely on that ordering for logging or rollback.
