---
source: scripts/ops/demo-remove-registry.ts
sha256: bdb50d4f4bc0e347a53ebf5618f697d54e6541cb91a877aa9e2c9cabff0a4cf7
generated_at: 2026-10-01T12:35:04.414206+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove-registry.ts

## Purpose

G-D2 step 3 of the shop-module removal pipeline. It edits the **central registry files** that name a module outside its own folder — `src/modules.ts`, `package.json` npm-script lines, and `docker/crontab` — using generic name-matching rather than a hand-kept list of which script belongs to which module. It is the "lists" half of what `demo-remove.ts` orchestrates; the other half (per-folder teardown) lives in sibling `demo-remove-*.ts` scripts.

## Key elements

- **`RemovalNote`** (exported interface) — `{ file, detail }` pair returned by every removal function and collected by `demo-remove.ts` for its final report.
- **`removeModuleFolders(repoRoot, names)`** (exported) — `rmSync`-deletes each `src/modules/<name>/` directory.
- **`stripModuleLines(content, names, importPattern)`** (internal) — line-level filter that drops import lines and bare-identifier entry lines (array elements, union members, map entries) for the given names.
- **`stripModuleRegistry(repoRoot, names)`** (exported) — reads `src/modules.ts`, applies `stripModuleLines`, writes back. Single `RemovalNote` returned.
- **`readOwnedOpsFiles(repoRoot)`** (internal) — scans `scripts/ops/*.ts` for a `` Removal: owned by `<module>` `` doc-comment (DDD-D5) and returns `{ absolutePath, basename, owner }` for each match.
- **`removeShopOwnedOpsScripts(repoRoot, shopNames)`** (exported) — orchestrates the three-step teardown: delete owned `.ts` files → remove their `package.json` script lines → remove their `docker/crontab` entries. Returns one `RemovalNote` per action.
- **`removePackageJsonScripts(repoRoot, opsBasenames)`** (internal) — regex-removes `"name": "tsx scripts/ops/<basename>.ts"` lines; returns the removed script *names* for the crontab step.
- **`removeCrontabEntries(repoRoot, scriptNames)`** (internal) — removes each matching cron line **plus** the contiguous run of `#` comment lines immediately above it.

## Relationships

- **`scripts/ops/demo-remove.ts`** — Parent orchestrator. This file is its step 3; `demo-remove.ts` imports `removeModuleFolders`, `stripModuleRegistry`, and `removeShopOwnedOpsScripts` and aggregates their `RemovalNote[]` into the final report.
- **`scripts/ops/demo-remove-authorization.ts`, `demo-remove-contract.ts`, `demo-remove-modules.ts`, `demo-remove-scenarios.ts`, `demo-remove-tests.ts`** — Sibling step scripts (steps 1, 2, 4, 5, 6 of the same pipeline). They each handle a different per-folder concern; this file handles the cross-cutting registry edits that span all of them. No direct imports between them — coordination happens only through `demo-remove.ts`.

## Notes

- **DDD-D5 convention is the single source of truth.** This script does not maintain a list of which ops file belongs to which module. It reads the `Removal: owned by …` comment at the top of each `scripts/ops/*.ts` file. If a file lacks that comment it is invisible to this script and will not be deleted.
- **Module names must be single lowercase-hyphen words.** The `entryPattern` regex and the `readOwnedOpsFiles` owner pattern both assume bare names with no camelCase aliases. A module named `cartCheckout` would not be matched.
- **Ordering is load-bearing.** `removeShopOwnedOpsScripts` deletes the `.ts` files first, then `package.json` lines, then `crontab` lines, because the crontab step needs the exact script names that `removePackageJsonScripts` just removed.
- **Crontab comment-block consumption.** `removeCrontabEntries` strips all contiguous `#` lines *directly above* a matching entry. If you insert a blank line between the comment block and the cron line, the comments will be left behind.
- **`@module` file** — no default export; all public API is via named exports. Import with `import { removeModuleFolders, … } from '…'`.
