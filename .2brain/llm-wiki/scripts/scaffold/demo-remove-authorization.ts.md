---
source: scripts/scaffold/demo-remove-authorization.ts
sha256: 1f5cbb87460ba9822c1e2d96f683fb2a50d7dc7afad077019fcd76c50fa48a49
generated_at: 2026-10-14T14:30:56.280870+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-authorization.ts

## Purpose

Removes a deleted module's authorization traces from the two shared, hand-maintained YAML files (`authorization-roles.yaml` and `authorization-conformance.yaml`). It reads the modules' `authorization.yaml` fragments **before** their folders are deleted, computes which permission keys and CASL subjects become orphaned, then applies targeted text edits to strip those entries. It exists because the shared files are edited by hand from the fragments (unlike `authorization-keys.yaml`, which is auto-assembled), and must be cleaned up explicitly when a module goes away.

## Key elements

- **`RemovedAuthorization`** (interface) — the output of the read step: a `ReadonlySet` of removed permission keys and a `ReadonlySet` of subjects no surviving fragment still declares.
- **`readRemovedAuthorization(repoRoot, names)`** — scans the `authorization.yaml` fragment of every module in `names` (plus all surviving modules and the core fragment) to determine which keys are unique to the removed set and which subjects become unused.
- **`stripRoleGrants(repoRoot, removed)`** — line-filters `shared/authorization-roles.yaml` to drop list items matching a removed key; inserts ` []` after a `permissions:` heading whose last item was removed so the mapping still parses. Returns a `RemovalNote`.
- **`stripConformanceCases(repoRoot, removed)`** — splits `shared/authorization-conformance.yaml` at the `cases:` heading, filters the shared admin key list, then prunes individual case chunks (removes whole cases whose subject is gone or whose only held keys are removed; otherwise strips removed keys from inline `permissions: [...]` lists). Returns a `RemovalNote`.
- **`pruneCase`** (internal) — applies the per-case decision logic: drop the chunk, or rewrite its inline permission lists.
- **`splitCases` / `INLINE_PERMISSIONS` / `KEY_LINE`** (internal) — regex helpers for chunking case blocks and identifying key list items.

## Relationships

- **`scripts/scaffold/demo-remove-registry.ts`** — provides the `RemovalNote` type imported by this module; the two "strip" functions return that type.
- **`scripts/scaffold/demo-remove-modules.ts`** — sibling in the same scaffold directory; the likely orchestrator that sequences the authorization cleanup relative to folder deletion and registry removal.
- **`tests/unit/scripts/scaffold/demo-remove-authorization.test.ts`** — unit tests for the functions exported here.
- **`src/modules/feedback/tests/integration/export.test.ts`** — integration test in a module whose authorization entries would be affected by this script's edits; appears in the dependency graph as a consumer of the resulting file state.

## Notes

- **Call order matters:** `readRemovedAuthorization` must run *before* the module folders are deleted, because it reads their `authorization.yaml` files. The sibling orchestration script is responsible for sequencing this correctly.
- **Text edits, not YAML round-trips:** all mutations are line-level filters and regex replacements. A parse→modify→stringify cycle would re-flow descriptions and break the byte-for-byte parity with the PHP twin.
- **Emptied `permissions:` lists:** a role whose last key is removed gets an explicit `[]` appended so the YAML remains valid (a bare `permissions:` with nothing below is not a mapping value).
- **Orphan-subject detection:** a subject is considered orphaned only if *no* surviving fragment **and** the core fragment still declare it. If any other module still uses that subject, cases referencing it are kept.
