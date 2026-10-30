---
source: scripts/docs/generate-audit-actions.ts
sha256: ecf1d68df9d8db731c11f88697b42726be47b531813aa23a79681b15fde4939b
generated_at: 2026-10-29T01:34:01.669995+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-audit-actions.ts

## Purpose

Generates (or checks) the audit-action reference table embedded in `docs/tools/winston.md` between `<!-- audit-actions:start/end -->` markers. It reads every declared action from infrastructure and each module's `audit.ts`, scans all `src/` call sites to discover the `targetType` each action is fired against, and renders a sorted Markdown table. In `--check` mode it reports drift without writing, making the committed doc page itself the regression guard for the audit vocabulary.

## Key elements

- **`checkOnly`** — boolean from `hasFlag('check')`; when true, `applyMarkerBlocks` reports drift and sets `process.exitCode` instead of rewriting the file.
- **`DeclaredAction` / `AuditActionRow`** — interfaces describing one action (owner, varName, key, value) plus the discovered `targetType`.
- **`walk(directory)`** — recursive `.ts` file collector that skips `tests/` subdirectories.
- **`readModuleActions(file)`** — dynamically `import()`s a module's `audit.ts`, locates the action map by shape (object whose values are all strings), and returns the export name + `Record<string, string>`.
- **`collectDeclaredActions()`** — merges `coreAuditActions` (infrastructure) with every module's actions found via `modulesWith`.
- **`TARGET_WINDOW` (300)** — how many characters on each side of an `owner.KEY` reference to scan for a `targetType:` or `entity:` literal.
- **`TARGET_FIELD`** — regex matching both `targetType` and `entity` field spellings with either quote style.
- **`targetTypesOf(identifier, sources)`** — searches all source text for the identifier, collects literal target values within the window.
- **`targetTypeCell(types)`** — renders `—` (no literal found), a single backticked value, or `(varies: …)` for multiple.
- **`actionTable(rows)`** — builds the sorted Markdown table string.
- **`main()`** — orchestrates collection → target discovery → table rendering → `applyMarkerBlocks` write/check.

## Relationships

- **`scripts/cli.ts`** — provides `hasFlag` for parsing the `--check` flag.
- **`scripts/docs/marker-block.ts`** — provides `applyMarkerBlocks`, which inserts/replaces the table between the marker comments and handles check-vs-write semantics.
- **`scripts/fail-script.ts`** — provides `failScript` used as the top-level catch handler.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT` and `modulesWith` to discover which module folders contain an `audit.ts`.
- **`src/infrastructure/observability/audit.ts`** — imported for `coreAuditActions`, the three app-level `security.*` actions that seed the table.

## Notes

- `targetType` is never declared alongside the action; it is a free string passed at each call site. Discovery is a bounded text search (±300 chars), so actions selected via same-file helper functions (e.g. `auditActionForUpdate`) are reported as `—` rather than risk a wrong attribution.
- `readModuleActions` identifies the action map by *shape* (all-string object) because the export name varies per module. A module whose `audit.ts` fails to load will throw and abort the generator rather than silently omitting its actions.
- The three infrastructure `security.*` actions always render `—` for target type (no object literal to attach to).
- The table is sorted by owner then key so that a rename is the *only* diff a given change can produce in the doc page.
- `tests/cross-cutting/audit-actions.test.ts` (not listed as a neighbor here) validates structure (uniqueness, dotted naming convention, every module accounted for); this page is the vocabulary itself.
