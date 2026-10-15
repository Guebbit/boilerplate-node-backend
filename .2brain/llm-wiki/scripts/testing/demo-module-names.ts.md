---
source: scripts/testing/demo-module-names.ts
sha256: 1980d54953f2323758435600428d41d5f3e5d82edbac8413a781bbd4bb5f5a69
generated_at: 2026-10-15T09:48:08.439074+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/demo-module-names.ts

## Purpose

Shared reader that answers "which module folders does `demo:remove` target today?" by reading each module's own `module.yaml` descriptor and filtering on the `group` field, rather than maintaining a hand-kept list. Both the scratch measurement script and the production strip script consume this single source so a module relabel is picked up automatically.

## Key elements

- **`REMOVABLE_GROUPS`** (module-level constant, `ReadonlySet<string>`) — the two `module.yaml` group values that `demo:remove` deletes: `'shop'` and `'example'`. Everything in all other groups (notably `foundation`) is left untouched.
- **`readDemoModuleNames(repoRoot: string): string[]`** (exported function) — joins `repoRoot/src/modules`, calls `readAllModuleDescriptors`, filters entries whose descriptor `group` is in `REMOVABLE_GROUPS`, and returns the matching module folder names. Accepts any checkout root (scratch copy or real repo).

## Relationships

- **`scripts/docs/module-descriptor.ts`** — imports `readAllModuleDescriptors`, which performs the filesystem walk and YAML parse. This file adds the group-filtering layer on top.
- **`scripts/scaffold/demo-remove.ts`** — the "real strip" consumer; calls `readDemoModuleNames` to get the list of folders to delete.
- **`scripts/testing/measure-demo-strip.ts`** — the scratch-copy measurement consumer; uses the same function so both scripts agree on scope.
- **`tests/unit/scripts/testing/demo-module-names.test.ts`** — unit tests for the filtering behavior.

## Notes

- The `example` group is included because it represents the copy-paste template module; a deployment that has instantiated it must have it stripped as well (it is mounted in production, so anyone can create a note against it). See `docs/theory/strategic-ddd.md#4a-foundation-and-shop` for the group taxonomy.
- Because the list is derived from `module.yaml` at call time, adding or relabelling a module folder requires no edit to this file or to either consumer script.
