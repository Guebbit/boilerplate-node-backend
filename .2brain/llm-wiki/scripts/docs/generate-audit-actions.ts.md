---
source: scripts/docs/generate-audit-actions.ts
sha256: fd996af7863f5d2f0ed35c5aa3a3eb5602963a8aeea31a60572c1b16ea17d136
generated_at: 2026-10-01T12:29:16.203183+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-audit-actions.ts

## Purpose

Generates (or checks) the audit-action reference table embedded in `docs/tools/winston.md`. It collects every declared audit action from infrastructure and all modules, discovers each action's `target_type` by scanning call-site source text, and renders a Markdown table between marker comments. Running with `--check` reports drift without writing, making the committed doc itself the regression guard for the audit vocabulary.

## Key elements

- **`main()`** — Orchestrates: collects declared actions, reads all `src/` sources, resolves target types, writes (or checks) the table via `applyMarkerBlocks`.
- **`collectDeclaredActions()`** — Returns `DeclaredAction[]` from two sources: `coreAuditActions` (infrastructure) and each module's own `audit.ts` export.
- **`readModuleActions(file)`** — Dynamically imports a module's `audit.ts` and locates the action map by shape (object of string values), so a broken import fails loudly.
- **`targetTypesOf(identifier, sources)`** — Finds every literal `target_type:` or `entity:` value within a ±300-char window of `owner.KEY` references across all sources.
- **`targetTypeCell(types)`** — Formats the table cell: `—` for undiscoverable, a single backtick-quoted value, or `(varies: …)` for multiple.
- **`actionTable(rows)`** — Builds the sorted Markdown table (owner → key order) so a rename is the minimal diff.
- **`checkOnly`** — Set when `--check` is in `process.argv`; passed through to `applyMarkerBlocks` to report instead of write.
- **`TARGET_WINDOW` (300)** — Half-width of the source-text window searched for a target literal near an action reference.
- **`TARGET_FIELD`** — Regex matching `target_type:` or `entity:` with a quoted string value.

## Relationships

- **`scripts/docs/marker-block.ts`** — Provides `applyMarkerBlocks`, which handles the start/end comment delimiters, in-place replacement, and the `--check` drift-reporting contract.
- **`src/infrastructure/observability/audit.ts`** — Source of `coreAuditActions`; the three app-level `security.*` actions (no module owner, no object target) are imported directly here.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI wave test that exercises this script as part of the mutation/drift-detection pipeline; ensures `--check` mode is wired into the correct wave.

## Notes

- `target_type` is **not** a declared constant anywhere; it is a free string passed at each `recordAudit` / `emitAuditEvent` / `buildAuditEvent` call site. This script recovers it by scanning source text within a fixed window, the same heuristic `generate-module-graph.ts` uses for event edges. Actions fired via a helper (e.g. `auditActionForUpdate`) that places the target outside the window will show as `—`.
- The table is sorted by owner then key so that the **only** diff a rename or addition produces is the changed row — no reordering noise.
- Modules without an `audit.ts` are silently skipped; the cross-cutting test `tests/cross-cutting/audit-actions.test.ts` is responsible for flagging that a module is missing one.
- The script is intended to be run via the `docs:audit-actions` npm script (referenced in the drift-report message).
