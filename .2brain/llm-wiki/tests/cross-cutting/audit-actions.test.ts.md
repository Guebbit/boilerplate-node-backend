---
source: tests/cross-cutting/audit-actions.test.ts
sha256: 7f261ca2717ba219345f300c65053095fdc70f0315ce060edcb961c36bfb4593
generated_at: 2026-09-27T15:49:13.627471+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/audit-actions.test.ts

## Purpose

A cross-cutting structural test that validates the audit-action vocabulary across **all** modules in one sweep. Rather than hard-coding a list of every action string (which would reintroduce the cross-module coupling the domain split eliminates), it asserts four invariants: uniqueness, dotted naming convention, file reachability, and explicit accounting for modules that intentionally emit no audit actions.

## Key elements

- **`EXPECTED_NON_AUDITING`** — Array of module names (`addresses`, `antibot`, `audit-logs`, `observability`, `wishlist`) that deliberately emit no audit actions. Each is justified in a block comment.
- **`moduleFolders()`** — Returns all directory names under `MODULES_ROOT` (i.e. `src/modules/`).
- **`listAuditFiles()`** — Discovers every `src/modules/<name>/audit.ts` that exists on disk; returns `{ module, file }` pairs.
- **`readActions(file)`** — Dynamically `import()`s an audit file and extracts the exported `Record<string, string>` by shape (the only object-valued export whose values are all strings), so a broken module fails loudly instead of silently contributing nothing.
- **Test 1 — "finds an audit vocabulary…"** — Asserts the sweep actually discovered files (canary) and that each discovered file declares at least one action.
- **Test 2 — "never lets two modules claim the same action string"** — Collects all action values into a map and reports any collision between modules.
- **Test 3 — "spells every action as dotted lower snake_case"** — Validates each action against `/^[a-z][\d_a-z]*(\.[a-z][\d_a-z]*){1,3}$/` (2–4 dot-separated segments).
- **Test 4 — "keeps every module either auditing or explicitly excused"** — Flags any module folder that has no `audit.ts` and is not in `EXPECTED_NON_AUDITING`.
- **Test 5 — "keeps the non-auditing list free of…"** — Flags stale entries: modules in `EXPECTED_NON_AUDITING` that have since gained an `audit.ts` or no longer exist as a folder.

## Relationships

- **`tests/support/paths.ts`** — Imports `MODULES_ROOT` (aliased `@tests/paths`), the canonical base path for `src/modules/`. All directory enumeration and file discovery in this test depends on that constant.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — Peer test in the same `account` module; shares the `tests/support/paths.ts` dependency. No direct import or reference between the two files.

## Notes

- `readActions` uses dynamic `import()` rather than static imports so the test file never hard-codes a per-module import list. The exported const name varies per module (`accountAuditActions`, `cartAuditActions`, …), so extraction is done by structural shape, not by name.
- The naming regex mirrors the identical bound in the BE repository; renaming an action must satisfy both guards.
- `EXPECTED_NON_AUDITING` is the single place to add or remove a module's "we intentionally don't audit" status. Test 5 keeps the list honest by failing if an entry becomes stale (module deleted) or obsolete (module now audits).
- The canary in Test 1 asserts `readdirSync(MODULES_ROOT).length > 0` rather than a fixed count, deliberately avoiding a magic-number copy of `src/modules.ts` that would go stale silently.
