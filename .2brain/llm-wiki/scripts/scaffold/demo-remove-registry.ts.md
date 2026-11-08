---
source: scripts/scaffold/demo-remove-registry.ts
sha256: c4e1ec610a3afbec52e431a8be4557ee9a59462a04814e492c4f5011b24177ee
generated_at: 2026-11-08T02:58:33.328554+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-registry.ts

## Purpose
Handles the "central lists" half of the shop-module strip: it deletes each module's folder under `src/modules/` and surgically removes that module's import line, `enabledModules` array entry, and `ModuleName` union member from `src/modules.ts`. It exists so that removal is driven by the module's *name* and the file's known shape (via `registry` helpers) rather than a separate hand-maintained list of lines to delete.

## Key elements
- **`RemovalNote`** (interface) — `{ file, detail }` tuple returned by every step so `demo-remove.ts` can print a unified final report.
- **`removeModuleFolders(repoRoot, names)`** — `rmSync` each `src/modules/<name>/` directory recursively; returns one `RemovalNote` per folder.
- **`stripModuleRegistry(repoRoot, names)`** — reads `src/modules.ts`, passes it through `stripModuleLines`, writes the result back, and returns a single `RemovalNote`.
- **`importIdentifier(line)`** (internal) — extracts the bound identifier from an `import X from …` line.
- **`stripModuleLines(content, names)`** (internal) — filters out any line whose import-key, entry-key, or leading `|` union-member matches a target name. Matching is name-based (the scaffolder's own keys), not regex-per-module.

## Relationships
- **`scripts/scaffold/registry.ts`** — provides `entryKey`, `importKey`, and `memberKey`, the canonical line-shape matchers this file uses to identify import, array-entry, and union-member lines. This keeps the file's grammar defined in exactly one place.
- **`scripts/scaffold/demo-remove.ts`** — the orchestrator; imports `removeModuleFolders` and `stripModuleRegistry` as steps in its removal pipeline and collects their `RemovalNote` arrays for the final report.
- **`scripts/scaffold/demo-remove-alert-rules.ts`**, **`…-authorization.ts`**, **`…-modules.ts`**, **`…-scenarios.ts`**, **`…-tests.ts`**, **`…-validation-labels.ts`** — sibling strip-step modules that handle other "central lists" (alert rules, authorization rules, etc.). They share the same `RemovalNote` contract and are invoked alongside this file by `demo-remove.ts`.
- **`tests/unit/scripts/scaffold/demo-remove-registry.test.ts`** — unit tests for `removeModuleFolders` and `stripModuleRegistry`.

## Notes
- Module folder names may be hyphenated (`stock-alerts`), but the import identifier is camelCase (`stockAlerts`). Array-entry matching therefore goes through the *import identifier*, not the raw folder name; `stripModuleLines` resolves this by first collecting identifiers from matching import lines.
- Union-member lines are distinguished from other quoted words by requiring a leading `|` after trimming whitespace — a deliberate guard against false positives on quoted strings elsewhere in the file.
- Scheduled jobs are *not* handled here; they live on each module's own manifest and are cleaned up automatically when the folder is deleted (plus an `npm run regenerate` crontab rewrite).
