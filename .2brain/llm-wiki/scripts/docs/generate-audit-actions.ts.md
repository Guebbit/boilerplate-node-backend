---
source: scripts/docs/generate-audit-actions.ts
sha256: 9f63ab35809a58ad18d63067e4cc5d3d74430ba4ba94ad28f6c7ae5de9a66523
generated_at: 2026-09-27T13:55:02.286971+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-audit-actions.ts

## Purpose

Generates the audit-action reference table inside `docs/tools/winston.md` (between `<!-- audit-actions:start/end -->` markers). It imports every module's action map and infrastructure's `coreAuditActions`, scans source for literal target types at call sites, and writes a sorted Markdown table. The committed page *is* the regression guard: a renamed or added action surfaces as a doc diff instead of being pinned by hand in per-module test files.

## Key elements

- **`main()`** — orchestrates collection, target-type discovery, and page write via `applyMarkerBlocks`.
- **`collectDeclaredActions()`** — gathers `DeclaredAction[]` from `coreAuditActions` (owner: `infrastructure`) plus every `src/modules/*/audit.ts`.
- **`readModuleActions(file)`** — dynamically imports a module's `audit.ts`; finds the action map by shape (object whose values are all strings) because the export name varies per module.
- **`targetTypesOf(identifier, sources)`** — regex-searches all `.ts` sources for references to `owner.KEY` and, within a ±300-char window, extracts the literal value of `target_type:` or `entity:`.
- **`targetTypeCell(types)`** — formats the column: `—` (none found), a single backticked value, or `(varies: …)`.
- **`actionTable(rows)`** — builds the 4-column Markdown table, sorted by owner then key so a rename is the only diff it produces.
- **`walk(directory)`** — recursive `.ts` file listing that skips `tests/` directories.
- **`checkOnly`** — when `--check` is in `process.argv`, reports drift without rewriting (the mode `complete` uses).

## Relationships

- **`scripts/docs/marker-block.ts`** — provides `applyMarkerBlocks`, which writes or checks the marker-delimited block in the target page and sets `process.exitCode`.
- **`src/infrastructure/observability/audit.ts`** — source of `coreAuditActions` (the three `security.*` actions). These are the only actions whose owner is `infrastructure`.

## Notes

- `target_type` is **not declared** adjacent to an action; it is a free string at each `recordAudit`/`emitAuditEvent` call site. The 300-char window heuristic (same trade-off as `generate-module-graph.ts`'s `readEventEdges`) means actions chosen by a same-file helper beyond that window show as `—` rather than risk a wrong attribution.
- The three `security.*` actions always render `—` for target type (no object to attach to).
- `tests/cross-cutting/audit-actions.test.ts` still validates **structure** (uniqueness, dotted convention, module coverage); this page validates **vocabulary**.
- Run via the `docs:audit-actions` npm script; `complete` runs it with `--check`.
