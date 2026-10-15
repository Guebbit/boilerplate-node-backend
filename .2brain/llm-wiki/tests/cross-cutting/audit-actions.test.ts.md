---
source: tests/cross-cutting/audit-actions.test.ts
sha256: 266f87475d9dfef5cf448fa4ca2cadd9e29336486541d8ebbb2df5085e7c4ea7
generated_at: 2026-10-15T12:35:32.714035+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/audit-actions.test.ts

## Purpose

Cross-cutting test that validates the audit-action vocabulary across every module structurally, without naming any domain. It guards four failure modes that no per-module test can catch: duplicate action strings, naming-convention violations, undiscovered audit files, and unexplained absence of an `audit.ts`.

## Key elements

- **`EXPECTED_NON_AUDITING`** — Derived at import time from `module.yaml` descriptors; lists modules that explicitly declare `noAudit`. Not hardcoded, so it tracks the source of truth automatically.
- **`moduleFolders()`** — Returns every directory name under `MODULES_ROOT`.
- **`listAuditFiles()`** — Discovers all existing `src/modules/<name>/audit.ts` files via `readdir` + `existsSync`; returns `{ module, file }` pairs.
- **`readActions(file)`** — Dynamically imports an `audit.ts` file and locates the exported action record by shape (a non-null object whose values are all strings), since the export name varies per module.
- **`describe('audit actions across modules')`** — Five `it` blocks:
  1. Every auditing module declares at least one action (with a canary that the sweep actually found files).
  2. No two modules export the same action string.
  3. Every action matches `^[a-z][\d_a-z]*(\.[a-z][\d_a-z]*){1,3}$` (2–4 dotted snake_case segments).
  4. Every module folder either has an `audit.ts` or is in `EXPECTED_NON_AUDITING`.
  5. No module in `EXPECTED_NON_AUDITING` actually has an `audit.ts` (stale-entry guard).

## Relationships

- **`scripts/docs/module-descriptor.ts`** — Imports `readAllModuleDescriptors(MODULES_ROOT)` to read each module's `module.yaml` and extract the `noAudit` flag, which populates `EXPECTED_NON_AUDITING`.
- **`tests/support/paths.ts`** — Imports `MODULES_ROOT` as the filesystem root for all directory/file discovery in this test.
- **`tests/unit/scripts/docs/module-catalogue.test.ts`** — Shares the same two dependencies (`module-descriptor.ts`, `paths.ts`) and exercises the same module-descriptor surface, but has no direct import or runtime interaction with this file.

## Notes

- `readActions` finds the export **by shape, not by name**, because each module uses a different identifier (`accountAuditActions`, `cartAuditActions`, …). If a module's `audit.ts` fails to import, the test fails at `import(file)` rather than silently passing with zero actions.
- The canary in the first test asserts `readdirSync(MODULES_ROOT).length > 0` against the **disk**, not against a hardcoded integer, to avoid a stale count going unnoticed when modules are added or removed.
- The action-name regex is intentionally identical to the backend repo's bound, so a rename satisfying this test also satisfies the other repository's guard.
- Adding or removing a non-auditing module requires only editing that module's own `module.yaml`; this test file is never touched.
