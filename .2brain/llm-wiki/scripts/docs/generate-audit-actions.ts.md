---
source: scripts/docs/generate-audit-actions.ts
sha256: b75529ec702f07d77d4de5ea68b4b9da5eed4b6fc1a331ae80f11e282b5fa856
generated_at: 2026-10-14T07:14:41.514294+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-audit-actions.ts

## Purpose

Generates the audit-action reference table in `docs/tools/winston.md` by reading every declared action (infrastructure's `coreAuditActions` plus each module's own `audit.ts` export), scanning call sites for the `targetType`/`entity` literal they pass, and writing a sorted Markdown table between `<!-- audit-actions:start -->` / `<!-- audit-actions:end -->` markers. In `--check` mode it reports drift without writing, making the committed page itself the regression guard for renames and additions.

## Key elements

- **`main()`** – Entry point. Collects declared actions, walks all of `src/` into memory, resolves each action's target type, builds the table, and hands it to `applyMarkerBlocks`.
- **`collectDeclaredActions()`** – Merges infrastructure's `coreAuditActions` with every module's action map (dynamically imported via `readModuleActions`).
- **`readModuleActions(file)`** – Imports a module's `audit.ts` at runtime and locates the action map by shape (an object whose values are all strings), returning both the export's variable name and the key→value record.
- **`targetTypesOf(identifier, sources)`** – Regex-scans every source file for the `owner.KEY` identifier and, within a ±300-char window, captures the `targetType:` or `entity:` literal. Returns a `Set` of distinct targets.
- **`targetTypeCell(types)`** – Formats the set: `—` (no literal found), a single backticked value, or `(varies: …)` when multiple distinct literals appear.
- **`actionTable(rows)`** – Produces the 4-column Markdown table, sorted by owner then key so a rename is the only diff a change can produce.
- **`walk(directory)`** – Recursively collects `.ts` files, skipping any `tests/` subdirectory.
- **`TARGET_WINDOW` / `TARGET_FIELD`** – Constants governing the call-site scan: a 300-char window and a regex matching both `targetType:` and `entity:` with either quote style.
- **`checkOnly`** – Set when `--check` appears in `process.argv`; passed to `applyMarkerBlocks` to report rather than rewrite.

## Relationships

- **`scripts/docs/marker-block.ts`** – Provides `applyMarkerBlocks`, the shared utility that locates the marker comments in the target page, replaces or diffs the body, and sets `process.exitCode`.
- **`src/infrastructure/observability/audit.ts`** – Source of `coreAuditActions`, the three app-level `security.*` actions that are the only actions this script imports directly (module actions are loaded dynamically at runtime).
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** – CI wave test that exercises this script as part of the mutation/wave suite; the script is invoked under the `docs:audit-actions` npm script that the wave test targets.

## Notes

- `targetType` is never declared alongside an action; it is a free string passed at each call site. The 300-char window is a deliberate trade-off (same approach as `generate-module-graph.ts`'s `readEventEdges`): actions resolved through an intermediate helper (e.g. `auditActionForUpdate`) will show as `—` rather than risk a wrong attribution from a wider search.
- `readModuleActions` discovers the export by shape, not by a hard-coded name, so a module that renames its action map will still be picked up—but a module whose `audit.ts` fails to load will cause the script to throw rather than silently omit actions.
- The `entity:` field in the `TARGET_FIELD` regex exists specifically for the `createDeleteController` spec where the target appears *before* the `auditAction:` reference, outside the normal `recordAudit` ordering.
- `--check` is the mode `complete` runs; plain invocation rewrites the page in place.
