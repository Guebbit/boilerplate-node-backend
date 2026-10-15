---
source: scripts/scaffold/demo-remove-authorization.ts
sha256: eb27ad41441cefc71edcdf61028e26aeb1da10dec4768aa9079c5ad7cf6a39e9
generated_at: 2026-10-15T09:45:35.571018+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-authorization.ts

## Purpose

Removes a deleted module's authorization traces from the two shared YAML files that reference permission keys by hand: `shared/authorization-roles.yaml` and `shared/authorization-conformance.yaml`. It performs targeted text edits (not a YAML parse/stringify round-trip) to keep the files byte-identical to their PHP twins.

## Key elements

- **`RemovedAuthorization`** (interface) — the output of the read phase: the set of permission keys the removed modules declared, plus the set of CASL subjects that no surviving fragment or core fragment still uses.
- **`readRemovedAuthorization(repoRoot, names)`** — reads each removed module's `authorization.yaml` fragment *while its folder still exists*, compares against surviving fragments and the core fragment, and returns the `RemovedAuthorization` pair.
- **`stripRoleGrants(repoRoot, removed)`** — filters out `- <key>` list items matching removed keys from `authorization-roles.yaml`; if a role's `permissions:` block is left empty it appends ` []` so the file still parses. Returns a `RemovalNote`.
- **`stripConformanceCases(repoRoot, removed)`** — splits `authorization-conformance.yaml` into a head (shared admin key list) and a `cases:` section, prunes removed keys from the head, and drops or prunes individual case chunks via `pruneCase`. Returns a `RemovalNote`.
- **`pruneCase(chunk, removed)`** *(internal)* — returns `undefined` (drop the case) when the case targets a removed subject or its caller held *only* removed keys; otherwise returns the chunk with removed keys excised from inline `permissions: [...]` lists.
- **`splitCases`**, **`KEY_LINE`**, **`INLINE_PERMISSIONS`** *(internal)* — regex helpers for line-level key matching, case-block splitting (including preceding comment lines), and inline permissions-list extraction.

## Relationships

- **`scripts/contracts/fragments.ts`** — imports `readAuthorizationFragment` to parse each module's `authorization.yaml` and the shared `authorization-keys.core.yaml` into key/subject entries.
- **`scripts/modules-on-disk.ts`** — imports `modulesWith` to discover which surviving modules still carry an `authorization.yaml` fragment.
- **`scripts/scaffold/demo-remove-registry.ts`** — imports the `RemovalNote` type used as the return type of both strip functions, so the caller can collect per-file edit summaries.
- **`tests/unit/scripts/scaffold/demo-remove-authorization.test.ts`** — unit-tests the three exported functions against fixture YAML files.

## Notes

- **Order matters:** `readRemovedAuthorization` must run *before* the module folders are deleted, because it reads fragments from `src/modules/<name>/authorization.yaml` on disk.
- **Text edits, not YAML round-trips:** the shared YAML files are committed byte-for-byte to a PHP twin; re-stringifying would re-wrap every description line and create spurious diffs.
- **Empty-role guard:** a role whose `permissions:` block loses all keys gets an explicit ` []` appended rather than being left as a bare key with no value.
- **Orphan-subject detection:** a subject is considered orphaned only if *no* surviving fragment and *no* core fragment still declare it; the check is computed at read time, not at edit time.
- **Deny-case safety:** a conformance case is dropped (not merely pruned) when its caller would end up holding zero keys, because a deny assertion with no keys would vacuously pass for the wrong reason.
