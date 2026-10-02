---
source: scripts/testing/shop-module-names.ts
sha256: 1d963091f496c2c904ee29677ebb4a2f4ea4a1132c62c36e6d02ce037e2fc3f6
generated_at: 2026-10-01T12:41:56.935849+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/shop-module-names.ts

## Purpose

Single shared reader that answers "which module folders are `group: shop` today?" by reading each module's own `module.yaml` descriptor. It exists so that `measure-demo-strip.ts` (report-only) and `demo-remove.ts` (the actual G-D2 step-3 strip) ask the same question with one implementation, meaning a relabelled module changes both callers without editing either.

## Key elements

- **`readShopModuleNames(repoRoot: string): string[]`** — Sole export. Scans `<repoRoot>/src/modules/` for directories, then returns only those whose `module.yaml` declares `group: shop`.

## Relationships

- **`scripts/docs/module-descriptor.ts`** — Provides `readModuleDescriptor`, called per-module to extract the `group` field from each `module.yaml`.
- **`scripts/testing/measure-demo-strip.ts`** — Consumer (report-only mode). Asks the same "which shop modules?" question via this function.
- **`scripts/ops/demo-remove.ts`** — Consumer (the real strip operation, G-D2 step 3). Asks the same question via this function.

## Notes

- The `repoRoot` parameter lets callers point at a scratch copy (testing) or the real checkout (ops) — the function is filesystem-location-agnostic.
- Non-directory entries inside `src/modules/` are silently skipped (`entry.isDirectory()` filter).
- The "shop" grouping is conceptually defined in `docs/theory/strategic-ddd.md#4a-foundation-and-shop`.
