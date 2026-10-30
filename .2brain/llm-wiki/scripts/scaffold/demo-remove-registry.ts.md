---
source: scripts/scaffold/demo-remove-registry.ts
sha256: c4e1ec610a3afbec52e431a8be4557ee9a59462a04814e492c4f5011b24177ee
generated_at: 2026-10-29T01:42:23.294724+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-registry.ts

## Purpose

Handles the "central lists" half of the demo-module removal pipeline: it edits `src/modules.ts` (the one file that names a module outside its own folder) and deletes the module's folder under `src/modules/`. It exists so that `demo-remove.ts` can strip a module's registry entries generically by name, without a second hand-kept list.

## Key elements

- **`RemovalNote`** (interface) — `{ file, detail }` record of a single deletion, collected into the final report printed by `demo-remove.ts`.
- **`removeModuleFolders(repoRoot, names)`** — recursively deletes each named folder under `src/modules/` via `rmSync` (`force: true`, so missing folders are a no-op). Returns one `RemovalNote` per name.
- **`stripModuleRegistry(repoRoot, names)`** — reads `src/modules.ts`, calls the internal `stripModuleLines`, writes the result back, and returns a single `RemovalNote`.
- **`stripModuleLines(content, names)`** *(internal)* — splits the file into lines and filters out three kinds: the `import` line (matched via `importKey`), the `enabledModules` array entry (matched via `entryKey` on the import's *identifier*), and the `ModuleName` union member (matched via `memberKey`, gated on a leading `|` after `trimStart`).
- **`importIdentifier(line)`** *(internal)* — extracts the bound identifier from an `import x from …` line via a small regex.

## Relationships

- **`scripts/scaffold/registry.ts`** — supplies `entryKey`, `importKey`, and `memberKey`, the line-matching helpers that describe the *shape* of `src/modules.ts`. This file imports them so the scaffolder and the remover agree on the file's structure from a single source.
- **`scripts/scaffold/demo-remove.ts`** — the orchestrator that calls `removeModuleFolders` and `stripModuleRegistry` and aggregates their `RemovalNote` arrays into the final report.
- **`tests/unit/scripts/scaffold/demo-remove-registry.test.ts`** — unit tests covering the exported functions.
- **Sibling `demo-remove-*.ts` files** (`demo-remove-alert-rules`, `demo-remove-authorization`, `demo-remove-modules`, `demo-remove-scenarios`, `demo-remove-tests`, `demo-remove-validation-labels`) — handle other aspects of the same strip; this file is specifically the registry/folder half.

## Notes

- The `enabledModules` array entry is matched by the **import identifier** (e.g. `stockAlerts`), not by the folder name (e.g. `stock-alerts`). A hyphenated folder name will *not* appear literally in the array.
- Union-member detection relies on the line starting with `|` after `trimStart`. A quoted word elsewhere in the file that happens to equal a module name is intentionally *not* stripped.
- `removeModuleFolders` uses `force: true`, so calling it on an already-removed module is safe (no throw).
- The file doc comment notes that scheduled jobs live on the module's own manifest, so they disappear with the folder and are reconciled by `npm run regenerate` — this script does **not** touch crontab entries.
