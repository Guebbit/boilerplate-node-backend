---
source: scripts/testing/demo-module-names.ts
source_sha256: 0232505680a12db33adbbd8f33a9257daeef472307c4cc2e4ba04aeb4e190eaa
context_sha256: c832de57e774761a26b28a348c954cedbcafaf2ee78dd02ce42169cb3739785c
generated_at: 2026-11-22T02:18:31.716359+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/testing/demo-module-names.ts

## Purpose
Provides a single shared reader that answers "which module folders does `demo:remove` delete?" It derives the list from each module's own `module.yaml` (`group` field) instead of a hand-maintained list, so relabelling a module changes the script's behavior without editing the script.

## Key elements
- `readDemoModuleNames(repoRoot)` — the only export. Joins `repoRoot/src/modules`, loads all descriptors via `readAllModuleDescriptors`, keeps those whose `group` is removable, and returns their folder names as `string[]`.
- `REMOVABLE_GROUPS` (private) — a `ReadonlySet` of `'shop'` and `'example'`; effectively "everything but `foundation`".

## Relationships
- `scripts/docs/module-descriptor.ts` — supplies `readAllModuleDescriptors(modulesRoot)`, which returns a name-to-descriptor map of module descriptors. This file filters that map by each descriptor's group.
- `scripts/scaffold/demo-remove.ts` — the consumer, which asks this module for the names of the folders to remove.
- `tests/unit/scripts/testing/demo-module-names.test.ts` — the unit test for this reader.

## Notes
- `repoRoot` can be a scratch copy or the real checkout, so the function is not tied to the current working directory.
- The `example` module is removed too. It is the template to copy, a deployment that has copied it deletes it, and it is mounted in production (anyone can create a note).
- The source's doc comment points to a "foundation and shop" section of a strategic-DDD document for background on the group split.
