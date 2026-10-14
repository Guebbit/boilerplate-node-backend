---
source: scripts/scaffold/demo-remove-registry.ts
sha256: 3da6a1093a56992e95dfa4222372e62ae005c83fe038c7d5554bc7c39ca577b9
generated_at: 2026-10-14T14:31:38.973333+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-registry.ts

## Purpose

The "central lists" half of the demo-remove strip. When a shop module is removed, this module edits every file that names that module *outside* its own folder—`src/modules.ts`, `package.json`, `docker/crontab`, and the module-owned `scripts/ops/*.ts` files—using pattern matching on the module name rather than a second hand-maintained list. It is invoked by `demo-remove.ts` as one step in the full removal pipeline.

## Key elements

- **`RemovalNote`** (interface) – A `{ file, detail }` record of one deletion; collected into the final report printed by `demo-remove.ts`.
- **`removeModuleFolders(repoRoot, names)`** – Recursively deletes each `src/modules/<name>/` directory.
- **`stripModuleLines(content, names, importPattern)`** (internal) – Generic line filter that removes import lines and bare-name entries (array elements, union members, map keys) matching the given names.
- **`stripModuleRegistry(repoRoot, names)`** – Reads `src/modules.ts`, strips each module's import, `enabledModules` array entry, and `ModuleName` union member via `stripModuleLines`, then writes the file back.
- **`readOwnedOpsFiles(repoRoot)`** (internal) – Scans `scripts/ops/*.ts` for a `Removal: owned by \`<module>\`` doc-comment tag and returns the owning module for each file.
- **`removeShopOwnedOpsScripts(repoRoot, shopNames)`** – Orchestrates the three-step ops-script removal: delete the script files, remove their `package.json` entries, then remove the matching `docker/crontab` lines.
- **`removePackageJsonScripts(repoRoot, opsBasenames)`** (internal) – Strips `"<name>": "tsx scripts/ops/<basename>.ts"` lines from `package.json`; returns the removed script names for the crontab step.
- **`removeCrontabEntries(repoRoot, scriptNames)`** (internal) – Removes each `npm run <name>` line from `docker/crontab` along with the contiguous `#` comment block immediately above it.

## Relationships

- **`scripts/scaffold/demo-remove.ts`** – The orchestrator. This file's exported functions (`removeModuleFolders`, `stripModuleRegistry`, `removeShopOwnedOpsScripts`) are the registry-editing steps that `demo-remove.ts` calls and aggregates into a single `RemovalNote[]` report.
- **`scripts/scaffold/demo-remove-authorization.ts`**, **`demo-remove-modules.ts`**, **`demo-remove-scenarios.ts`**, **`demo-remove-tests.ts`** – Sibling "strip" steps that handle their own cleanup domains (authorization, module internals, scenarios, tests). They share the same `demo-remove.ts` caller and the `RemovalNote` reporting shape but do not import or interact with this file directly.

## Notes

- **Owner discovery is convention-based.** The link between an ops script and its owning module is the `Removal: owned by \`<module>\`` doc-comment line at the top of each `scripts/ops/*.ts` file. There is no central mapping; if that comment is missing or misspelled, the script is silently skipped.
- **Single-word module names are required.** The regex in `stripModuleLines` matches bare identifiers. A camelCase alias or multi-word name would not be stripped from arrays/unions.
- **Crontab comment-block assumption.** `removeCrontabEntries` consumes the contiguous run of `#` lines *immediately above* the `npm run` line as that entry's comment block. A blank line or non-`#` line between the comment and the entry would cause the comment to be left behind.
- **`package.json` pattern is literal.** The script matches `tsx scripts/ops/<basename>.ts` verbatim. If the invocation prefix changes (e.g., a different runner or path), the regex will not match and the line will be left in place.
