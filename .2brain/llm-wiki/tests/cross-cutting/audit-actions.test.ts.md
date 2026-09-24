---
source: tests/cross-cutting/audit-actions.test.ts
sha256: 39d596df6f57d2ab974ca2ae66c2b07c44238090dd72e11cd32eabbcde80b374
generated_at: 2026-09-23T19:53:30.727412+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/audit-actions.test.ts

## Purpose

A cross-cutting integration test that validates the audit-action vocabulary across **all** modules in a single sweep. It enforces four invariants that no per-module unit test can catch on its own: global uniqueness of action strings, the dotted naming convention, reachability of every module's `audit.ts`, and an explicit accounting of modules that intentionally emit no actions. It does this structurally (dynamic import + shape inspection) rather than by hard-coding a list of action names, deliberately avoiding the cross-module coupling the module split was designed to remove.

## Key elements

- **`EXPECTED_NON_AUDITING`** – Reviewed allow-list of modules that intentionally declare no audit actions (`addresses`, `antibot`, `audit-logs`, `observability`, `wishlist`). Must be kept in sync when a module starts or stops auditing.
- **`moduleFolders()`** – Returns every directory name under `src/modules/` via `readdirSync`/`statSync`.
- **`listAuditFiles()`** – Returns `{ module, file }` pairs for each `src/modules/<name>/audit.ts` that exists on disk.
- **`readActions(file)`** – Dynamically imports the given `audit.ts` and locates the exported action map by shape (the only object-of-string value). Returns `{}` if nothing matches.
- **`describe('audit actions across modules')`** – Five test cases:
    1. _finds an audit vocabulary in every module that emits one_ – canary guard + non-empty check per module.
    2. _never lets two modules claim the same action string_ – global uniqueness via a `Map`.
    3. _spells every action as dotted lower snake_case_ – regex `/^[a-z][\d_a-z]*(\.[a-z][\d_a-z]*){1,3}$/` (2–4 dot-separated segments).
    4. _keeps every module either auditing or explicitly excused_ – every folder must appear in `listAuditFiles()` or in `EXPECTED_NON_AUDITING`.
    5. _keeps the non-auditing list free of modules that started auditing, or stopped existing_ – prevents stale entries in `EXPECTED_NON_AUDITING`.

## Relationships

- **`src/modules/<name>/audit.ts`** (all modules, including `account`) – Dynamically imported at test-run time via `readActions`. This is the only code-level dependency; the test never statically imports any module.
- **`src/modules/account/tests/unit/two-factor.test.ts`** – No direct import or reference in this file. The relationship is indirect: this test validates the `account` module's audit vocabulary (by importing `account/audit.ts`), while `two-factor.test.ts` exercises the account module's two-factor feature in isolation. Both live in the `account` module tree but do not share symbols.

## Notes

- **Dynamic import, not static.** `readActions` uses `await import(file)` so a module that fails to load surfaces as a test failure rather than a silent empty result.
- **Export discovered by shape, not name.** Each module's action map is exported under a different identifier (`accountAuditActions`, `cartAuditActions`, …). The test finds it as "the exported value that is a non-null object whose values are all strings." Adding a second such object to an `audit.ts` would cause a silent mis-selection.
- **`EXPECTED_NON_AUDITING` is the one piece of state that must be maintained manually.** A new module that _should_ audit must add its `audit.ts`; a new module that _shouldn't_ must be added here. Test 4 and 5 catch both omissions.
- **Regex boundary.** Actions must have 2–4 dot-separated segments (e.g. `auth.login`, `admin.product.deactivate`). This mirrors an identical constraint in the backend repository, so a rename satisfies both guards simultaneously.
- **Filesystem-rooted.** `MODULES_ROOT` is computed relative to `__dirname` (`../../src/modules`). The test will fail if the repo layout changes or if the test is relocated without updating the relative path.
