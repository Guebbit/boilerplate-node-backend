---
source: scripts/docs/generate-audit-actions.ts
sha256: a40a6596d2de2166d690abed0669d2d6dc29d2dfa81522f218ec7f42ca121fe4
generated_at: 2026-11-14T17:31:52.599817+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-audit-actions.ts

## Purpose
Generates (or `--check`s) the audit-action reference table inside a committed docs page. It imports every module's `audit.ts` plus infrastructure's `coreAuditActions`, scans all of `src/` for the literal target type each action is fired against, and writes the resulting Markdown table between HTML-comment markers. The committed page doubles as a regression guard: a renamed or added action surfaces as a doc diff rather than requiring a per-module test to restate the vocabulary.

## Key elements
- **`main()`** — entry point; collects actions, reads every `.ts` under `src/`, resolves target types, and delegates to `applyMarkerBlocks`.
- **`collectDeclaredActions()`** — merges infrastructure's three `coreAuditActions` with each module's own action map into a flat `DeclaredAction[]`.
- **`readModuleActions(file)`** — dynamically imports a module's `audit.ts` and locates the action map by shape (object of strings) rather than by export name, so a load failure throws instead of silently contributing nothing.
- **`targetTypesOf(identifier, sources)`** — regex-matches `owner.KEY` across all source text, then looks within a ±300-char window for a `targetType:` or `entity:` literal; returns the set of distinct targets found.
- **`targetTypeCell(types)`** — renders the cell: `—` (no literal target), a single backticked value, or `(varies: …)` for multiple.
- **`actionTable(rows)`** — sorts by owner then key and emits the four-column Markdown table.
- **`walk(directory)`** — recursive `.ts` file collector that skips `tests/` subdirectories.
- **`TARGET_WINDOW` / `TARGET_FIELD`** — the 300-char search radius and the regex (`targetType|entity`) used to extract the literal target.
- **`checkOnly`** — set from `--check` (via `hasFlag`); when true the script reports drift and exits non-zero instead of rewriting.

## Relationships
- **`scripts/cli.ts`** — imports `hasFlag` to read the `--check` flag.
- **`scripts/docs/marker-block.ts`** — imports `applyMarkerBlocks` to insert or verify the table between the `<!-- audit-actions:start/end -->` markers.
- **`scripts/fail-script.ts`** — imports `failScript` as the top-level `.catch` handler.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` (repo base path) and `modulesWith` (filter `src/modules/*` to those containing `audit.ts`).
- **`src/infrastructure/observability/audit.ts`** — imports `coreAuditActions`, the three app-level `security.*` actions included in the table.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — lists this script in a CI mutation wave, confirming it is exercised by the test harness's wave-scheduling logic.

## Notes
- `targetType` is **not** declared next to the action constant; it is a free string at each `recordAudit`/`emitAuditEvent` call site. The script infers it via a 300-char window scan, so actions whose target is only a runtime parameter (e.g. `updateEntityTranslations`) will show `—`.
- The `entity:` alternative in `TARGET_FIELD` covers the `createDeleteController` spec shape where the target field precedes the action identifier rather than following it.
- `readModuleActions` finds the action map by shape (object whose values are all strings), not by export name, so modules are free to name the export whatever they like.
- The table is sorted deterministically (owner → key) so that a rename is the *only* diff a change can produce in the committed page.
