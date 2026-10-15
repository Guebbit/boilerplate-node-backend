---
source: scripts/scaffold/demo-remove-registry.ts
sha256: 0f0d5f9fc4bdbc45a0c5fd33686f3e81ec7e82491b44ab98f5508e65aef56c39
generated_at: 2026-10-15T09:45:59.869212+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-registry.ts

## Purpose

Handles the "central lists" half of module removal: every shared file that names a module outside its own folder is edited generically off the module name. It strips module entries from `src/modules.ts`, deletes the module's owned `scripts/ops/*.ts` files along with their `package.json` script lines and `docker/crontab` entries, and returns structured removal notes for the orchestrator's final report.

## Key elements

- **`RemovalNote`** (exported interface) — pairs a file path with a detail string; collected and printed by `demo-remove.ts`'s report.
- **`removeModuleFolders`** (exported) — recursively deletes `src/modules/<name>/` for each given module name.
- **`stripModuleRegistry`** (exported) — reads `src/modules.ts`, removes the import line, `enabledModules` array entry, and `ModuleName` union member for each target, then writes the file back.
- **`removeShopOwnedOpsScripts`** (exported) — the main entry point for ops cleanup: deletes owned `scripts/ops` files, removes their `package.json` npm-script lines, then removes the matching `docker/crontab` entries. Returns `RemovalNote[]` for all three steps.
- **`stripModuleLines`** (internal) — line-level filter using `importKey`/`entryKey`/`memberKey` from `./registry` to identify which lines in `src/modules.ts` belong to the target modules.
- **`readOwnedOpsFiles`** (internal) — scans `scripts/ops/*.ts` for a `Removal: owned by \`<module>\`` doc-comment pattern and returns owner-mapped file list.
- **`removePackageJsonScripts`** (internal) — regex-removes `"<name>": "tsx scripts/ops/<basename>.ts"` lines; returns the removed script names.
- **`removeCrontabEntries`** (internal) — regex-removes the `npm run <name>` line in `docker/crontab` plus the contiguous `#` comment block directly above it.

## Relationships

- **`scripts/scaffold/registry.ts`** — imports `entryKey`, `importKey`, `memberKey`; these are the canonical line-matchers for `src/modules.ts`, so the file's shape is described in one place.
- **`scripts/scaffold/demo-remove.ts`** — orchestrator that calls the exported functions here and prints the collected `RemovalNote[]` in its final report.
- **`scripts/scaffold/demo-remove-modules.ts`** and the other `demo-remove-*.ts` siblings — parallel artifact-specific removal steps (alert rules, authorization, scenarios, tests, validation labels); this file covers the central-registry and ops-script artifacts, complementing rather than duplicating their work.

## Notes

- **Ordering is load-bearing in `removeShopOwnedOpsScripts`:** files are deleted first, then `package.json` scripts, then crontab entries. The crontab step needs the exact npm-script names extracted in step 2, so the sequence cannot be reordered.
- **Crontab comment removal assumes a strict layout:** the `#` comment block sits immediately above the `npm run` line with no blank lines in between. If a comment block is separated by blank lines, it will not be consumed.
- **Ownership discovery is comment-driven:** `scripts/ops` files must contain a doc-comment line matching `Removal: owned by \`<module>\`` (regex allows optional `the` and backticks). A file without that comment is invisible to this script and will be left behind.
- **Union-member matching in `stripModuleLines`:** a line is treated as a `ModuleName` union member only if it starts with `|` after trimming. A quoted module name elsewhere (e.g., in a string literal) will not be stripped.
