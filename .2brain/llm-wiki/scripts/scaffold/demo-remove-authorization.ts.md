---
source: scripts/scaffold/demo-remove-authorization.ts
sha256: 611bae7e7083af53f18b868bae6b23cca6c08769030f8e2f7d350fa98eb03085
generated_at: 2026-10-29T01:42:03.191723+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-authorization.ts

## Purpose

Provides the authorization-specific removal logic for the module-scaffolding demo. Before a module's folder is deleted, it reads that module's `authorization.yaml` fragment to collect its rules, permission sets, and CASL subjects, then performs **text-level** edits on two shared YAML files (`authorization-roles.yaml` and `authorization-conformance.yaml`) to strip every reference to the removed modules. It exists because those two files are maintained by hand from fragments and cannot be safely regenerated via a YAML round-trip (the output is committed byte-for-byte to a PHP twin).

## Key elements

- **`RemovedAuthorization`** (interface) — the result of reading removed fragments: a `Set` of `action:subject` rule ids, a `Set` of permission-set names, and a `Set` of subjects no longer used by any surviving fragment or the core fragment.
- **`readRemovedAuthorization(repoRoot, names)`** — reads each removed module's fragment *while it still exists on disk*, then reads all surviving fragments plus `authorization-keys.core.yaml` to determine which subjects become orphaned. Returns a `RemovedAuthorization`.
- **`stripRoleGrants(repoRoot, removed)`** — edits `shared/authorization-roles.yaml`: removes list items whose name matches a removed set; converts a `sets:` heading left with zero items to `sets: []` so the file still parses. Returns a `RemovalNote`.
- **`stripConformanceCases(repoRoot, removed)`** — edits `shared/authorization-conformance.yaml`: removes removed rules from the shared admin rule list, drops every case whose `subject` is in `removed.subjects`, and drops any case whose caller's inline `permissions` list contained *only* removed rules. Returns a `RemovalNote`.
- **`pruneCase`** *(internal)* — prunes a single case chunk; returns `undefined` when the case should be deleted entirely.
- **`splitCases`** *(internal)* — splits the `cases:` section into per-case chunks (including preceding comment lines).
- **`NAME_LINE`, `INLINE_PERMISSIONS`** *(internal)* — regexes for matching `- name` list items and inline `permissions: [...]` arrays.

## Relationships

- **`scripts/contracts/fragments.ts`** — imports `readAuthorizationFragment` to parse each module's `authorization.yaml` and the core fragment.
- **`scripts/modules-on-disk.ts`** — imports `modulesWith` to enumerate which surviving modules have an `authorization.yaml`, so their subjects can be counted as "still used."
- **`scripts/scaffold/demo-remove-registry.ts`** — imports the `RemovalNote` type; both `stripRoleGrants` and `stripConformanceCases` return that shape so the orchestrator can aggregate removal reports.
- **`scripts/scaffold/demo-remove-modules.ts`** — the higher-level orchestrator that sequences the full removal (registry, modules, authorization). This file is called *before* `demo-remove-modules` deletes the module folders, because `readRemovedAuthorization` reads from disk.
- **`tests/unit/scripts/scaffold/demo-remove-authorization.test.ts`** — unit tests covering the three exported functions.

## Notes

- **Read-before-delete ordering.** `readRemovedAuthorization` must be invoked while the target module folders still exist. Calling it after `demo-remove-modules` has removed the folders will throw on the missing `authorization.yaml` paths.
- **Text edits, not YAML round-trip.** All writes go through line-level filtering/`replaceAll` to preserve exact formatting, line-wrapping, and comments. Introducing `yaml.load` / `yaml.dump` would re-wrap descriptions and break the byte-for-byte PHP-twin contract.
- **"Emptied" case deletion.** A conformance case is dropped entirely if every key in its caller's `permissions` list was removed — the remaining deny would now pass for the wrong reason. This is distinct from the subject-removal check.
- **Anchor-tolerant `sets:` detection.** The regex for detecting an empty `sets:` list accounts for YAML anchors (`sets: &anchor`), but the `[]` insertion only appends after the colon, leaving the anchor intact.
- **Comment-aware emptying.** `stripRoleGrants` looks past blank/comment lines when deciding whether a `sets:` heading has a following item, so a comment between the heading and the first `- ` item does not prevent the `[]` insertion.
