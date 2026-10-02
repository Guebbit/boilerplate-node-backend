---
source: scripts/ops/demo-remove-authorization.ts
sha256: 1f5cbb87460ba9822c1e2d96f683fb2a50d7dc7afad077019fcd76c50fa48a49
generated_at: 2026-10-01T12:34:27.363958+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove-authorization.ts

## Purpose

Handles the authorization cleanup step of demo-module removal. It reads permission keys and subjects from the modules' `authorization.yaml` fragments **before** those folders are deleted, then performs surgical text edits (not YAML round-trips) on the two hand-maintained shared files—`shared/authorization-roles.yaml` and `shared/authorization-conformance.yaml`—to remove the now-orphaned grants and cases.

## Key elements

- **`RemovedAuthorization`** (interface) — bundle of two `ReadonlySet<string>` values: the keys declared by removed modules, and the CASL subjects no surviving fragment (or the core fragment) still uses.
- **`readRemovedAuthorization(repoRoot, names)`** — reads the fragments of the modules about to be removed plus all surviving fragments and the core fragment; returns the removed keys and the subjects that become orphaned. Must be called **before** the module folders are deleted.
- **`stripRoleGrants(repoRoot, removed)`** — line-filters `shared/authorization-roles.yaml` to drop list items matching removed keys; appends `[]` to any `permissions:` heading whose list becomes empty so the file still parses. Returns a `RemovalNote`.
- **`stripConformanceCases(repoRoot, removed)`** — splits `shared/authorization-conformance.yaml` into head and cases, removes removed keys from the shared admin list, drops entire case chunks whose `subject` is removed or whose caller held only removed keys, and prunes the remaining inline `permissions: [...]` lists. Returns a `RemovalNote`.
- **`pruneCase(chunk, removed)`** (internal) — per-case decision: `undefined` (drop) when the subject is removed or the permission list would empty out; otherwise returns the chunk with removed keys filtered from inline lists.
- **`splitCases`** (internal) — splits the cases section into per-case text chunks, keeping attached comment lines with their case.
- **`KEY_LINE` / `INLINE_PERMISSIONS`** (regex constants) — pattern-match a single key list item and inline `permissions: [...]` lists respectively.

## Relationships

- **`scripts/ops/demo-remove-registry.ts`** — provides the `RemovalNote` type that `stripRoleGrants` and `stripConformanceCases` return.
- **`scripts/ops/demo-remove-modules.ts`** — the orchestrating removal script that calls `readRemovedAuthorization` early (while folders still exist) and later invokes the two `strip*` functions as part of the pipeline.
- **`tests/unit/scripts/ops/demo-remove-authorization.test.ts`** — unit tests exercising the read and both strip functions.

## Notes

- Edits are raw text operations, **not** a YAML parse→modify→stringify cycle. The two target files are committed byte-for-byte to a PHP twin, so a re-stringify would re-wrap every description and produce noisy diffs.
- `readRemovedAuthorization` is order-sensitive: it must run **before** the module directories are removed, because it reads from `src/modules/<name>/authorization.yaml`.
- In `stripRoleGrants`, a `permissions:` heading is only treated as "emptied" if the next **non-blank, non-comment** line is not a valid key item—comment lines between the heading and the first list item are correctly skipped.
- `pruneCase` intentionally drops a case whose caller's permission list would become empty, not merely because it references a removed key, because an empty deny case would silently pass for the wrong reason.
