---
source: scripts/docs/generate-audit-actions.ts
sha256: ecf1d68df9d8db731c11f88697b42726be47b531813aa23a79681b15fde4939b
generated_at: 2026-11-08T02:46:59.007163+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-audit-actions.ts

## Purpose

Generates (or in `--check` mode, validates) the audit-action reference table embedded in `docs/tools/winston.md`. The table is the single source of truth for the audit vocabulary—every action's owner, wire value, and observed target type—so that a rename or addition surfaces as a visible diff in a reviewed doc page rather than requiring a hand-maintained per-module test.

## Key elements

- **`checkOnly`** — reads the `--check` flag via `hasFlag`; when set, the script reports drift instead of rewriting the page.
- **`DeclaredAction` / `AuditActionRow`** — row shape: `owner`, `varName`, `key`, `value`, plus the discovered `targetType` cell string.
- **`readModuleActions(file)`** — dynamically `import()`s a module's `audit.ts` and locates the action map by shape (an object whose values are all strings), since the export name differs per module.
- **`collectDeclaredActions()`** — merges infrastructure's `coreAuditActions` with every module's own actions (discovered via `modulesWith(MODULES_ROOT, 'audit.ts')`).
- **`targetTypesOf(identifier, sources)`** — regex-scans all `src/` source text for the action's `varName.KEY` reference and extracts `targetType:` / `entity:` literals within a ±300-char window.
- **`targetTypeCell(types)`** — renders the target column: `—` (none found), a single backtick value, or `(varies: …)` for multiple distinct targets.
- **`actionTable(rows)`** — builds the sorted Markdown table (owner → key order).
- **`main()`** — orchestrates collection, target discovery, and writes via `applyMarkerBlocks` between `<!-- audit-actions:start/end -->` markers.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — imports `coreAuditActions` to include the three app-level `security.*` actions in the table.
- **`scripts/docs/marker-block.ts`** — calls `applyMarkerBlocks` to insert or verify the table body between the HTML-comment markers in `winston.md`.
- **`scripts/modules-on-disk.ts`** — uses `REPO_ROOT` for path resolution and `modulesWith` to enumerate which module directories contain an `audit.ts`.
- **`scripts/cli.ts`** — calls `hasFlag('check')` to detect `--check` mode.
- **`scripts/fail-script.ts`** — provided as the `.catch` handler for unhandled errors in `main()`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises this script's output/behavior as part of the CI mutation-test suite.

## Notes

- **Target discovery is heuristic, not static analysis.** `targetType` is a free string passed at each `recordAudit`/`emitAuditEvent` call site, not declared alongside the action constant. The 300-char window (`TARGET_WINDOW`) and the `TARGET_FIELD` regex (`targetType:` or `entity:`) approximate the association. Actions whose target is chosen by a distant helper (e.g. `auditActionForUpdate`) will show `—` rather than a wrong guess.
- **Dynamic imports at build time.** `readModuleActions` does a runtime `import()` of each module's `audit.ts`; a module that fails to load causes the generator to throw (by design—no silent omission).
- **The doc *is* the regression guard.** The header comment states the philosophy explicitly: a rename shows up as a diff in the committed page. The separate cross-cutting test (`tests/cross-cutting/audit-actions.test.ts`) only checks structural invariants (uniqueness, dotted naming, full module coverage), not the values themselves.
- **Sorted output minimises diff noise.** Rows are sorted by owner then key, so adding/removing one action is the only diff shape a rename or addition produces.
