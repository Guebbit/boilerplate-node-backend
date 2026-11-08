---
source: scripts/scaffold/demo-remove-authorization.ts
sha256: 611bae7e7083af53f18b868bae6b23cca6c08769030f8e2f7d350fa98eb03085
generated_at: 2026-11-08T02:58:14.539489+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-authorization.ts

## Purpose

Performs text-level edits to the two shared authorization files (`authorization-roles.yaml` and `authorization-conformance.yaml`) when modules are removed. Because these files are hand-maintained from per-module fragments, they must be pruned *before* the module folders are deleted; the bundle (`authorization-keys.yaml`) self-heals via fragment deletion. Edits are line-by-line string operations, not YAML round-trips, to preserve byte-for-byte parity with the PHP twin.

## Key elements

- **`RemovedAuthorization`** (interface) — the three things a set of removed modules declared: `rules` (as `action:subject` strings), `sets` (permission-set names), and `subjects` (CASL subjects no surviving fragment or core fragment still uses).
- **`readRemovedAuthorization(repoRoot, names)`** — reads each removed module's `authorization.yaml` fragment while it still exists on disk, collects their rules/sets, then computes which subjects become orphaned. Must be called *before* folder deletion.
- **`stripRoleGrants(repoRoot, removed)`** — removes list items matching removed set names from `shared/authorization-roles.yaml`; inserts an explicit `[]` if a role's `sets:` key is left with no items.
- **`stripConformanceCases(repoRoot, removed)`** — removes removed rules from the shared admin list in the head of `shared/authorization-conformance.yaml`, and deletes entire case chunks whose subject is removed or whose `permissions:` list would be left empty.
- **`pruneCase`** (internal) — prunes one case chunk; returns `undefined` to signal the chunk should be dropped entirely.
- **`splitCases` / `INLINE_PERMISSIONS` / `NAME_LINE`** (internal helpers & regexes) — chunk-splitting and pattern matching used by the strip functions.

## Relationships

- **`scripts/contracts/fragments.ts`** — provides `readAuthorizationFragment`, used by `readRemovedAuthorization` to parse each module's `authorization.yaml` and the core fragment.
- **`scripts/modules-on-disk.ts`** — provides `modulesWith`, used to enumerate surviving modules that still declare an `authorization.yaml` (needed to determine which subjects are truly orphaned).
- **`scripts/scaffold/demo-remove-registry.ts`** — supplies the `RemovalNote` type that `stripRoleGrants` and `stripConformanceCases` return, so the caller can aggregate a change log.
- **`scripts/scaffold/demo-remove-modules.ts`** — sibling scaffold script that orchestrates the full module-removal sequence; this file is one step in that pipeline.
- **`tests/unit/scripts/scaffold/demo-remove-authorization.test.ts`** — unit tests covering the read and strip logic.

## Notes

- **Call ordering matters:** `readRemovedAuthorization` must run *before* any `rm -rf` of the module folders; it reads fragments from disk. The downstream `strip*` functions operate only on the two shared files.
- **No YAML serialization:** edits are filtered/rewritten line arrays joined back. A `yaml.stringify` round-trip would re-wrap multi-line descriptions and break the byte-identical PHP twin.
- **Empty-role sentinel:** a role whose `sets:` key loses all items gets an explicit `[]` appended so the YAML remains valid (a bare `sets:` key with no value is ambiguous).
- **Case deletion vs. pruning:** a conformance case is *deleted* (not just trimmed) if its subject is removed or if *every* key in its `permissions:` list is removed—leaving such a case would produce a deny-rule that passes for the wrong reason.
