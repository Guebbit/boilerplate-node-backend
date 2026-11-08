---
source: scripts/testing/demo-module-names.ts
sha256: ddfe2f31d14f06aa60728e942b94aed1d65a92b768d34dd1abfb987dd2933107
generated_at: 2026-11-08T03:02:25.878202+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/demo-module-names.ts

## Purpose

Provides a single discovery function that tells `demo:remove` *which* module folders to delete (those whose `module.yaml` says `group: shop` or `group: example`). Reading from each module's own descriptor means a relabelled module changes the removal set without editing this file.

## Key elements

- **`REMOVABLE_GROUPS`** – module-private `ReadonlySet<string>` holding `'shop'` and `'example'`; everything except `foundation` is removable.
- **`readDemoModuleNames(repoRoot: string): string[]`** – exported function. Joins `repoRoot/src/modules`, calls `readAllModuleDescriptors`, filters entries to those whose descriptor `group` is in `REMOVABLE_GROUPS`, and returns the array of module folder names.

## Relationships

- **`scripts/docs/module-descriptor.ts`** – imports `readAllModuleDescriptors` to read every `module.yaml` under `src/modules/` in one pass.
- **`scripts/scaffold/demo-remove.ts`** – the sole consumer; calls `readDemoModuleNames` to get the list of folders to strip during the scaffold teardown.
- **`tests/unit/scripts/testing/demo-module-names.test.ts`** – unit tests exercising `readDemoModuleNames` against fixture `module.yaml` files.

## Notes

- The `example` module is included because it is the copy-template: a deployment that has duplicated it removes the original, and it is mounted in production (public note creation), so the strip covers it too.
- `repoRoot` may be a scratch copy (tests) or the real checkout; the function only reads, never writes.
- See `docs/theory/strategic-ddd.md#4a-foundation-and-shop` for the group taxonomy this filter encodes.
