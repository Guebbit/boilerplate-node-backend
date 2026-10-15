---
source: scripts/docs/generate-audit-actions.ts
sha256: ac8b2597b8e2c18ddbee5c2ffccf56629d932ada48395518b507e71dd4d3b14e
generated_at: 2026-10-15T09:39:52.580602+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-audit-actions.ts

## Purpose

Generates (or validates, with `--check`) the audit-action reference table embedded in `docs/tools/winston.md`. It imports every module's own `audit.ts` for real, scans all of `src/` for call sites to recover each action's `targetType`, and writes a sorted Markdown table between marker comments. The committed page itself acts as the regression guard for the audit vocabulary.

## Key elements

- **`main()`** — Top-level orchestrator: collects declared actions, walks `src/` for source text, resolves target types, renders the table, and hands it to `applyMarkerBlocks`. Sets `process.exitCode` on drift in `--check` mode.
- **`collectDeclaredActions()`** — Merges `coreAuditActions` (infrastructure) with every module's action map (discovered via `modulesWith`) into a flat `DeclaredAction[]`.
- **`readModuleActions(file)`** — Dynamically imports a module's `audit.ts` and locates the action map *by shape* (the only export whose values are all strings), since the export name varies per module. A module that fails to load fails this generator rather than silently disappearing.
- **`targetTypesOf(identifier, sources)`** — For a given `varName.KEY` identifier, searches every source file within a ±300-char window for a `targetType:` or `entity:` literal and returns the set of distinct values found.
- **`targetTypeCell(types)`** — Formats the table cell: `—` (no literal found), a single backticked value, or `(varies: …)` listing all distinct targets sorted.
- **`actionTable(rows)`** — Renders the final 4-column Markdown table, sorted by owner then key so a rename is the only diff produced.
- **`walk(directory)`** — Recursive `.ts` file walker that skips `tests/` directories.
- **Constants** — `TARGET_WINDOW = 300`, `TARGET_FIELD` regex (matches both `targetType:` and `entity:` spellings), `START`/`END` marker comments, `checkOnly` (`--check` flag), `PAGE` path to `docs/tools/winston.md`.

## Relationships

- **`scripts/docs/marker-block.ts`** — Provides `applyMarkerBlocks`, the shared helper that inserts/replaces the table between the `<!-- audit-actions:start/end -->` markers and handles `--check` drift reporting.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT` (used to resolve `MODULES_ROOT` and `PAGE`) and `modulesWith(MODULES_ROOT, 'audit.ts')` to enumerate which module folders contain an `audit.ts`.
- **`src/infrastructure/observability/audit.ts`** — Source of `coreAuditActions`, the three app-level (`security.*`) audit actions that have no module owner.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Graph neighbor; exercises the CI wave scheduling that invokes this script via the `docs:audit-actions` npm task.

## Notes

- **`targetType` is heuristic, not declared.** No action's definition carries its target type; it is recovered by scanning call-site source text within a fixed 300-char window. Actions whose target is passed as a runtime variable (e.g. generic helpers like `upsertEntityTranslations`) or whose call site falls outside the window render as `—`. This is the same trade-off `generate-module-graph.ts` makes for event edges.
- **Shape-based export discovery.** `readModuleActions` finds the action map by iterating exports and checking that the value is a non-null object whose members are all strings. It does not guess a name, so a module that renames its export is still picked up—but a module that exports *two* such maps will match only the first (insertion order).
- **`--check` mode is the CI path.** In `--check`, the script exits non-zero with a drift message instead of rewriting the page, so the committed `winston.md` table is the single source of truth and the only artifact that gets reviewed.
- **The cross-cutting test still runs separately.** `tests/cross-cutting/audit-actions.test.ts` validates structure (uniqueness, dotted naming convention, every module accounted for); this generator validates *vocabulary* (the actual values). They are complementary, not redundant.
