---
source: scripts/docs/generate-audit-actions.ts
generated_at: 2026-11-22T02:02:35.690673+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/generate-audit-actions.ts

## Purpose
A `tsx` script that generates the audit action reference table inside the audit logs documentation page (`docs/modules/audit-logs.md` in the script's `PAGE` constant). It rewrites only the content between the `<!-- audit-actions:start -->` and `<!-- audit-actions:end -->` markers and leaves the surrounding prose untouched. The committed page acts as the regression guard for the audit vocabulary: a renamed or added action shows up as a diff in review. With `--check`, it reports drift instead of writing, and `complete` runs it that way.

## Key elements
- `checkOnly`: set from `hasFlag('check')`. It switches the script between rewriting the page and only reporting drift.
- `DeclaredAction` / `AuditActionRow`: an action's `owner`, `varName` (the exported map's name), `key` and wire `value`. The row type adds `targetType`.
- `walk(directory)`: recursively lists `.ts` files, skipping `tests/` directories.
- `readModuleActions(file)`: dynamically imports a module's `audit.ts`. It finds the export by shape, an object whose values are all strings, and returns its name and the action map. A module that fails to load fails the script.
- `collectDeclaredActions()`: combines `coreAuditActions` (owner `infrastructure`) with the actions of every module that has an `audit.ts`, found via `modulesWith(MODULES_ROOT, 'audit.ts')`.
- `TARGET_WINDOW` (300 chars) and `TARGET_FIELD`: the window around each `varName.KEY` reference in which the script looks for `targetType: '…'` or `entity: '…'`.
- `targetTypesOf(identifier, sources)`: scans all `src/` sources for every occurrence of an `owner.KEY` identifier and collects the literal target types found nearby.
- `targetTypeCell(types)`: renders `—` for none found, `` `type` `` for one, and `(varies: …)` with sorted types for several.
- `actionTable(rows)`: builds the Markdown table (Module, Action, Value, Target type), sorted by owner and then key.
- `main()`: collects the declared actions, reads the `src/` sources, builds the rows, and passes the table to `applyMarkerBlocks` with label `audit-actions`. It sets `process.exitCode` from the result.

## Relationships
- `src/infrastructure/observability/audit.ts`: provides `coreAuditActions`, the app-level `security.*` actions.
- `scripts/docs/marker-block.ts`: `applyMarkerBlocks` does the marker-delimited rewrite or drift check and returns the exit code.
- `scripts/modules-on-disk.ts`: provides `REPO_ROOT` and `modulesWith` for finding modules that have `audit.ts`.
- `scripts/cli.ts`: provides `hasFlag` for `--check`.
- `scripts/fail-script.ts`: `failScript` handles any rejection from `main()`.
- `tests/unit/scripts/mutation/ci/waves.test.ts`: it is a graph neighbor, but this file does not reference it directly.

## Notes
- `targetType` is not declared next to the actions. It is scraped as text from call sites, so it is heuristic. If an action is chosen by a helper and read further away than the 300-character window, the target is left as `—` rather than risk a wrong attribution.
- `—` also covers actions that have no object, such as the `security.*` ones, and generic helpers that take the target at runtime.
- The `varName` found by shape must match how call sites refer to the map, because lookups use `varName.KEY`.
- `tests/cross-cutting/audit-actions.test.ts` checks the structure (uniqueness, the dotted convention, every module accounted for). This page covers the vocabulary itself.
- Output is sorted so that only real changes, such as renames, produce diffs.
