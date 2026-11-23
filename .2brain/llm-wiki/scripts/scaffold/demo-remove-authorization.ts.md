---
source: scripts/scaffold/demo-remove-authorization.ts
source_sha256: 21b749627eb7f3069a6888ec522632d99476b19801599105829bb38cc8c09025
context_sha256: b05e111af84e14f83f09aa8b2d83cabb1e31a63104f20000a3cc0749a06c49f8
generated_at: 2026-11-22T02:14:26.786327+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/demo-remove-authorization.ts

## Purpose
When demo modules are removed from the repo, two shared authorization files still name their permissions by hand: `shared/rules/authorization-roles.yaml` and `shared/cases/authorization.cases.yaml`. This file reads what the removed modules declared (before their folders are deleted) and then text-edits those two files to drop the references. The generated bundle `shared/authorization-keys.generated.yaml` needs no edit here, because it is assembled from the deleted fragments.

## Key elements
- `RemovedAuthorization` (interface): `rules` (ids like `display:Order`), `sets` (permission set names), and `subjects` (CASL subjects no surviving or core fragment still declares).
- `readRemovedAuthorization(repoRoot, names)`: reads each removed module's authorization fragment under `src/modules/<name>/`. It reads the survivors' fragments and `shared/contracts/authorization-keys.core.yaml` to decide which subjects are still in use. It must run before the folders are removed.
- `stripRoleGrants(repoRoot, removed)`: removes list items in `authorization-roles.yaml` that name a removed set. If a `sets:` heading is left with no item after it (comment and blank lines are skipped when checking), it appends ` []` so the YAML still parses. It returns a `RemovalNote`.
- `stripConformanceCases(repoRoot, removed)`: splits `authorization.cases.yaml` after the `cases:` line into case chunks and prunes each one. It returns a `RemovalNote`.
- Internal helpers:
  - `NAME_LINE` matches a list item naming exactly one rule or set.
  - `splitCases` splits the text on `- name:` blocks, keeping the comment lines above each block with it.
  - `INLINE_PERMISSIONS` matches inline `permissions: [...]` lists.
  - `pruneCase` decides what happens to a single case chunk.
- `pruneCase` drops a case in two situations. One is when its `subject:` is a removed subject. The other is when any inline `permissions` list is non-empty and consists only of removed rules, because the deny would otherwise pass for the wrong reason. In every other case it strips the removed rules from the inline permission lists.

## Relationships
- `scripts/contracts/fragments.ts`: provides `readAuthorizationFragment`, which parses a fragment into `rules` (with `action` and `subject`) and `sets` (with `name`).
- `scripts/modules-on-disk.ts`: provides `modulesWith`, which lists the modules that have a given file in their folder. It is used here to find the surviving modules that have an authorization fragment.
- `scripts/scaffold/demo-remove-registry.ts`: supplies the `RemovalNote` type that the two strip functions return.
- `scripts/scaffold/demo-remove-modules.ts`: part of the same module-removal scaffold, and the expected caller of these functions. Not visible from this file.
- `tests/unit/scripts/scaffold/demo-remove-authorization.test.ts`: the unit tests for this file.

## Notes
- The edits are plain text, not a YAML parse and re-stringify. Both files are committed byte-for-byte to the PHP twin, and re-stringifying would re-wrap every description.
- `readRemovedAuthorization` has to be called before the module folders are deleted, because it reads the fragments from those folders.
- `stripConformanceCases` only handles inline `permissions: [...]` lists. Block-style lists are not touched.
- `stripRoleGrants` matches by bare name, so any list item in that file whose text equals a removed set name is dropped.
- Both strip functions overwrite their files in place.
