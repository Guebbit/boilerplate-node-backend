---
source: scripts/scaffold/demo-remove-authorization.ts
sha256: ff3731426788c47f7801af58db2966e18859510ca689bb996bc0e741d1618349
generated_at: 2026-11-14T17:40:13.848578+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-authorization.ts

## Purpose

Handles the authorization-cleanup step of the scaffold-removal pipeline. Before module folders are deleted, it reads each removed module's authorization fragment to collect the rules, permission sets, and CASL subjects they declared. It then performs surgical **text edits** (line filtering and regex replacement, not a YAML round-trip) on two shared files that reference those permissions by name: `shared/rules/authorization-roles.yaml` and `shared/cases/authorization.cases.yaml`. The text-edit approach is deliberate—these files are committed byte-for-byte to a PHP twin, and re-stringifying would re-wrap every description.

## Key elements

- **`RemovedAuthorization`** (interface) — the output of the read phase: the `rules` (as `"action:subject"` ids), `sets` (names), and `subjects` (only those no surviving fragment or the core fragment still uses) declared by the modules being removed.
- **`readRemovedAuthorization(repoRoot, names)`** — Reads the removed modules' fragments *and* all surviving modules' fragments (via `modulesWith` + `readAuthorizationFragment`) plus the core fragment. Returns a `RemovedAuthorization` describing what will become orphaned. Must be called **before** the module folders are deleted.
- **`stripRoleGrants(repoRoot, removed)`** — Filters out list items in `authorization-roles.yaml` whose name matches a removed set. If a role's `sets:` key ends up with no items, appends `[]` so the YAML still parses. Returns a `RemovalNote`.
- **`stripConformanceCases(repoRoot, removed)`** — Splits `authorization.cases.yaml` on the `cases:` heading, then prunes each case chunk: drops cases whose `subject` is removed, and drops cases whose inline `permissions: [...]` list contains *only* removed rules (a deny that would now pass for the wrong reason). Returns a `RemovalNote`.
- **`pruneCase`** (internal) — Per-chunk logic; returns `undefined` when the case should be discarded, otherwise the chunk with removed rule keys stripped from every inline permissions list.
- **`splitCases`** (internal) — Splits the cases section into chunks at `- name:` boundaries, keeping preceding comment lines with their case.
- **`NAME_LINE`**, **`INLINE_PERMISSIONS`** (internal regex) — Match single-name list items and inline `permissions: [...]` lists respectively.

## Relationships

- **`scripts/contracts/fragments.ts`** — Provides `readAuthorizationFragment`, which parses a module's or the core's authorization fragment into structured rule and set entries.
- **`scripts/modules-on-disk.ts`** — Provides `modulesWith`, used to enumerate surviving modules that still declare an authorization fragment, so their rules/sets count as "still in use."
- **`scripts/scaffold/demo-remove-registry.ts`** — Source of the `RemovalNote` type returned by both edit functions; peer step in the same removal pipeline.
- **`scripts/scaffold/demo-remove-modules.ts`** — The sibling scaffold step that actually deletes the module folders; this file must run **before** it so the fragments are still readable.
- **`tests/unit/scripts/scaffold/demo-remove-authorization.test.ts`** — Unit tests covering the read and both edit functions.

## Notes

- **Ordering is critical.** `readRemovedAuthorization` must execute before `demo-remove-modules` deletes the folders; the fragments live inside the module directory.
- **Text edits, not YAML parse/re-serialize.** Both target files are synced byte-for-byte to a PHP twin. A YAML round-trip would reflow every description string and create noisy diffs.
- **Empty-set fallback.** In `stripRoleGrants`, a role left with zero sets gets an explicit ` []` appended to the `sets:` line so the file remains valid YAML.
- **Case-drop heuristic.** A conformance case is discarded (not merely pruned) when *all* of its permissions were removed—keeping it would turn a deny into an unintended pass.
- **Comment handling.** The "next real line" check in `stripRoleGrants` skips blank and comment lines when deciding whether a `sets:` heading has any remaining items.
