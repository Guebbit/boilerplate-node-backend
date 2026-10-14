---
source: scripts/ops/demo-remove-registry.ts
sha256: 3da6a1093a56992e95dfa4222372e62ae005c83fe038c7d5554bc7c39ca577b9
generated_at: 2026-10-14T07:21:50.859299+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove-registry.ts

## Purpose

The "central lists" half of the shop-module removal pipeline (orchestrated by `demo-remove.ts`). It edits the files that *name* a module outside its own folder — `src/modules.ts`, `package.json`, `docker/crontab` — and deletes the module's source folder and its owned ops scripts. All lookups are name-based or comment-based; no secondary hand-maintained list is kept.

## Key elements

- **`RemovalNote`** (interface) — `{ file, detail }` pair accumulated for `demo-remove.ts`'s final report.
- **`removeModuleFolders(repoRoot, names)`** — `rmSync`s each `src/modules/<name>/` directory recursively.
- **`stripModuleLines(content, names, importPattern)`** (internal) — filters out import lines and bare-name entries (union members, array elements, map keys) in one pass.
- **`stripModuleRegistry(repoRoot, names)`** — reads `src/modules.ts`, applies `stripModuleLines` with the `from './modules/<name>/module'` import pattern, writes back.
- **`readOwnedOpsFiles(repoRoot)`** (internal) — scans `scripts/ops/*.ts` for a `` Removal: owned by `<module>` `` doc-comment and returns `{ absolutePath, basename, owner }` tuples.
- **`removeShopOwnedOpsScripts(repoRoot, shopNames)`** — orchestrates the three-step removal: delete owned `.ts` files → strip their `package.json` script lines → strip their `docker/crontab` lines (and preceding comment blocks).
- **`removePackageJsonScripts(repoRoot, opsBasenames)`** (internal) — regex-removes `"name": "tsx scripts/ops/<basename>.ts"` lines; returns the removed script names for the crontab step.
- **`removeCrontabEntries(repoRoot, scriptNames)`** (internal) — removes matching `npm run <name>` lines together with the contiguous `#` comment block directly above each.

## Relationships

- **`scripts/ops/demo-remove.ts`** — the caller/orchestrator; this file provides the registry-editing and owned-script-removal steps it invokes, and collects their `RemovalNote[]` results for the final report.
- **`scripts/ops/demo-remove-authorization.ts`, `demo-remove-modules.ts`, `demo-remove-scenarios.ts`, `demo-remove-tests.ts`** — siblings in the same `scripts/ops/` directory. At runtime, if any of them carry a `` Removal: owned by `<shop>` `` doc comment matching a shop being removed, `readOwnedOpsFiles` discovers them and `removeShopOwnedOpsScripts` deletes the file, its `package.json` line, and its crontab entry.

## Notes

- **Single-word names only.** `stripModuleLines` builds a regex by joining raw names with `|`, and the entry pattern matches a bare identifier. Module names must be a single token (no camelCase or spaced aliases) or the patterns will not match.
- **Deletion order is load-bearing.** The crontab step needs the *npm script names* produced by the `package.json` step, so the sequence (files → `package.json` → `crontab`) must not be reordered.
- **Ownership is comment-driven, not list-driven.** A script is only removed if its own doc comment says `Removal: owned by …`. Forgetting that comment on a new ops script means this file will silently skip it.
- **Crontab comment consumption.** The regex `(?:^#[^\n]*\n)*` greedily eats every `#` line above a match. If an unrelated comment block happens to be directly above the target line with no blank-line separator, it will be deleted too.
