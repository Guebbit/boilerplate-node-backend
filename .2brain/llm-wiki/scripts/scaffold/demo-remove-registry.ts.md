---
source: scripts/scaffold/demo-remove-registry.ts
generated_at: 2026-11-22T02:14:45.910431+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/demo-remove-registry.ts

## Purpose
Handles the "central lists" half of stripping `group: shop` modules from the demo. It deletes each shop module's own folder and edits `src/modules.ts`, the one central file that names modules, using the module names rather than a second hand-kept list. These are the registry-editing steps of `demo-remove.ts`. A module's scheduled jobs live on its own manifest, so they leave with the folder and `npm run regenerate` rewrites the crontab.

## Key elements
- `RemovalNote` (interface): `{ file, detail }` record of what was deleted and why, printed in `demo-remove.ts`'s final report.
- `removeModuleFolders(repoRoot, names)`: runs `rmSync` (recursive, forced) on `src/modules/<name>` for each name. Returns one note per folder (`detail: 'deleted'`).
- `stripModuleRegistry(repoRoot, names)`: reads `src/modules.ts`, strips the lines, writes the file back, and returns one note (`removed <names>`).
- `stripModuleLines` (internal): drops three kinds of line for the named modules:
  - the import line;
  - the `enabledModules` array entry;
  - the `ModuleName` union member (a line starting with `|`).
- `importIdentifier` (internal): extracts the identifier an import binds, via the regex `^import (\w+) from`.

## Relationships
- Imports `entryKey`, `importKey` and `memberKey` from `./registry`. These are the scaffolder's own line matchers, so the shape of `src/modules.ts` is described once, by the tool that writes it.
- Consumed by `demo-remove.ts`, which runs these steps and prints the `RemovalNote`s in its final report.
- The sibling `demo-remove-*` files (alert-rules, authorization, modules, scenarios, tests, validation-labels) handle other parts of the strip. This file covers only the module folders and the module registry.
- Tested by `tests/unit/scripts/scaffold/demo-remove-registry.test.ts`.

## Notes
- Array entries are matched by the identifier the import binds, not by the folder name. A hyphenated module such as `stock-alerts` is registered as `stockAlerts`.
- The identifiers are collected from the import lines before anything is filtered. A module with no matching import line therefore has no array entry removed.
- Union members are only matched on lines that start with `|`, so a quoted word elsewhere in the file is not removed.
- Nothing else names a module: the contract's module paths, the test router map and the docs read from disk or the registry.
- `stripModuleRegistry` always rewrites the file and reports `removed <names>`, even if no line matched.
