# tests/cross-cutting/audit-actions.test.ts

## Purpose

A structural, cross-cutting test that enforces invariants on the audit-action vocabulary across every module under `src/modules/` simultaneously. Rather than hard-coding a single list of every allowed action string (which would re-introduce the coupling the module split eliminates), it discovers each module's `audit.ts` at runtime and asserts four properties: uniqueness of action strings across modules, adherence to the dotted lower-snake-case naming convention, that no module silently goes un-audited, and that the explicit non-auditing exemption list stays accurate.

## Key elements

- **`EXPECTED_NON_AUDITING`** — A fixed array (`['audit-logs', 'observability', 'wishlist']`) naming modules that deliberately emit no audit actions. Each entry is justified by a comment; additions require review (see `AUDIT_COVERAGE_GAPS.md`).
- **`moduleFolders()`** — Returns every directory name under `src/modules/` via `readdirSync`/`statSync`.
- **`listAuditFiles()`** — Maps every module folder to its `audit.ts` path and filters to those that exist on disk.
- **`readActions(file)`** — Dynamically imports an `audit.ts` module and extracts the exported object of string values (found by shape, since the export name varies per module, e.g. `accountAuditActions`). Returns `{}` if no such object is found.
- **`describe('audit actions across modules')`** — Five test cases:
  1. *finds an audit vocabulary in every module that emits one* — canary check that the sweep actually locates files; asserts each discovered `audit.ts` declares at least one action.
  2. *never lets two modules claim the same action string* — builds a `Map<action, module>` and collects collisions.
  3. *spells every action as dotted lower snake_case* — validates against `/^[a-z][\d_a-z]*(\.[a-z][\d_a-z]*){1,3}$/` (2–4 dot-separated segments).
  4. *keeps every module either auditing or explicitly excused* — flags folders that have neither an `audit.ts` nor an entry in `EXPECTED_NON_AUDITING`.
  5. *keeps the non-auditing list free of stale entries* — ensures `EXPECTED_NON_AUDITING` contains no module that has since added an `audit.ts` or been removed from disk.

## Relationships

- Reads every `src/modules/<name>/audit.ts` at runtime via dynamic `import()`; the test is the sole consumer that aggregates all modules' action strings into a single namespace check.
- References `AUDIT_COVERAGE_GAPS.md` (linked in the file header comment) for the rationale behind each `EXPECTED_NON_AUDITING` entry.
- No other files import or are imported by this test; it is a leaf in the dependency graph.

## Notes

- `readActions` deliberately uses a real `import()` rather than parsing source text, so a module that fails to load (e.g. a runtime error in `audit.ts`) causes a test failure instead of silently contributing zero actions.
- The naming convention regex (`{1,3}` additional segments) mirrors the identical bound in the BE repository, so a renamed action satisfies both guards.
- The canary assertion in test 1 checks `readdirSync(MODULES_ROOT).length > 0` against the disk rather than asserting a fixed count, avoiding a stale integer that would go unnoticed when domains are added or removed.
- The test uses `__dirname` to resolve `MODULES_ROOT`, so it must be run from a context where the relative path `../../src/modules` is correct (standard Jest from the project root).
