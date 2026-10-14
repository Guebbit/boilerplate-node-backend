---
source: scripts/testing/demo-module-names.ts
sha256: f0534d19233f15f6c91b5a90723039aea7852418e9222604b0f3f50d4e9c6d32
generated_at: 2026-10-14T07:32:21.393712+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/demo-module-names.ts

## Purpose

Single source of truth for answering "which module folders does `demo:remove` target?" It reads each module's own `module.yaml` and returns the names whose `group` is `shop` or `example`. Both the report-only measurement script and the actual strip operation call this instead of maintaining their own lists, so a module relabelled to a different group is automatically excluded from both with no code edit.

## Key elements

- **`REMOVABLE_GROUPS`** (module-private) — A `ReadonlySet` of `'shop'` and `'example'`. The two `module.yaml` groups that the demo strip deletes; everything else (notably `foundation`) is left in place.
- **`readDemoModuleNames(repoRoot: string): string[]`** (exported) — Reads `src/modules/` under the given checkout root, filters to directories, then keeps only those whose `module.yaml` declares a group in `REMOVABLE_GROUPS`. Returns the folder names as a plain array.

## Relationships

- **`scripts/docs/module-descriptor.ts`** — Provides `readModuleDescriptor`, which parses each `module.yaml` and exposes the `.group` field used for the filter.
- **`scripts/ops/demo-remove.ts`** — The "real strip" consumer; calls `readDemoModuleNames` to get the folder list before deletion.
- **`scripts/testing/measure-demo-strip.ts`** — The report-only consumer; calls the same function to report which modules *would* be removed without performing the strip.
- **`tests/unit/scripts/testing/demo-module-names.test.ts`** — Unit tests exercising the exported function.

## Notes

- The `example` group is included because the example module is a production-mounted template (anyone can create a note) that a deployment copies and should delete after setup; see `docs/theory/strategic-ddd.md#4a-foundation-and-shop` for the rationale.
- `repoRoot` is a parameter so the same function works against a scratch copy (testing) or a live checkout (ops) without hardcoding a path.
- The directory listing uses `readdirSync(..., { withFileTypes: true })` to avoid a separate `stat` call per entry.
