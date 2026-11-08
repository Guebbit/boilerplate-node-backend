---
source: tests/cross-cutting/audit-actions.test.ts
sha256: 266f87475d9dfef5cf448fa4ca2cadd9e29336486541d8ebbb2df5085e7c4ea7
generated_at: 2026-11-08T09:23:44.483152+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/audit-actions.test.ts

## Purpose

Cross-cutting test that validates the audit-action vocabulary across every module structurally—uniqueness, dotted-naming convention, discoverability, and explicit opt-out—without hardcoding any action string. This avoids reintroducing the cross-module coupling the domain split was designed to remove, while still catching the silent failures (duplicate actions, malformed names, unguarded modules) that no single module's own tests would see.

## Key elements

- **`EXPECTED_NON_AUDITING`** — Array of module names whose `module.yaml` declares a `noAudit` reason. Derived at load time from descriptors; adding/removing an excuse never edits this file.
- **`moduleFolders()`** — Returns every directory under `MODULES_ROOT`.
- **`listAuditFiles()`** — Returns `{ module, file }` pairs for each `<module>/audit.ts` that exists on disk (discovered, not listed).
- **`readActions(file)`** — Dynamically imports a module's audit file and returns its exported string-map by shape (the sole object whose values are all strings). A module that fails to import fails the test rather than contributing nothing.
- **Five assertions:**
  1. Every module that has an `audit.ts` exports at least one action (with a canary ensuring the sweep itself is non-empty).
  2. No two modules claim the same action string.
  3. Every action matches `/^[a-z][\d_a-z]*(\.[a-z][\d_a-z]*){1,3}$/` (dotted lower snake_case, 2–4 segments).
  4. Every module folder is either auditing or explicitly excused via `noAudit`.
  5. No module in `EXPECTED_NON_AUDITING` actually has an `audit.ts` (staleness guard).

## Relationships

- **`scripts/docs/module-descriptor.ts`** — Provides `readAllModuleDescriptors(MODULES_ROOT)`, from which `EXPECTED_NON_AUDITING` is derived at module-load time. The test depends on the descriptor's `noAudit` field being the single source of truth for opt-outs.
- **`tests/support/paths.ts`** — Provides the `MODULES_ROOT` constant (imported as `@tests/paths`), the filesystem root under which all modules and their `audit.ts` files are discovered.

## Notes

- The naming regex is intentionally identical to the BE repository's bound, so a renamed action satisfies both repos' guards.
- `readActions` finds the export by shape (object of strings) because the const name varies per module (`accountAuditActions`, `cartAuditActions`, …). Adding a second non-string export to an `audit.ts` file will cause the action map to be silently missed.
- The canary in test 1 asserts `readdirSync(MODULES_ROOT).length > 0` rather than a literal count, specifically to avoid a stale integer that would go unnoticed when a domain is added or removed.
- The test imports audit files for real (dynamic `import`), so a TypeScript/bundle error in any `audit.ts` surfaces here instead of being invisible.
