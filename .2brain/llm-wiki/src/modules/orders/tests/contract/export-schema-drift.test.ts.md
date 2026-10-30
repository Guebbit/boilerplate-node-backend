---
source: src/modules/orders/tests/contract/export-schema-drift.test.ts
sha256: e852c6533fa63e958d7b6c84ca947b8db718c92fe2fce0185220c2df04bec073
generated_at: 2026-10-29T04:51:09.575328+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/export-schema-drift.test.ts

## Purpose

Guards against drift between the API schemas (`Order`, `OrderTimelineEntry`) and their flat export restatements (`ExportOrder`, `OrderTimelineExportEntry`). Because the two schemas in each pair are maintained by hand in `openapi.yaml` (they cannot be composed with `allOf` due to closed-sibling validation and Zod generator limitations), this test asserts they stay in lockstep except for their single intentional difference.

## Key elements

- **`ObjectSchema`** — minimal structural interface (`properties`, `required`, `additionalProperties`) used to type the parsed YAML.
- **`spec`** — the result of `parse(readFileSync('…/openapi.yaml'))`; loaded once at module scope from the file-relative path `../../openapi.yaml`.
- **`expectMirror(source, exported, field, inSource)`** — core helper. Verifies that:
  - `exported.additionalProperties` is `false`.
  - The allowed-differing `field` exists on the "bigger" side only.
  - All remaining property names and `required` entries match (order-insensitive).
  - Every shared property has an identical schema definition (deep `toEqual`).
- **`describe('ExportOrder mirrors Order', …)`** — asserts the two differ only by `actions`; `actions` is required on `Order` but absent from `ExportOrder`.
- **`describe('OrderTimelineExportEntry mirrors OrderTimelineEntry', …)`** — asserts the two differ only by `orderId`; `orderId` is required on the export entry.

## Relationships

No graph neighbors are recorded. The file's only external read is `src/modules/orders/openapi.yaml` (resolved relative to `__dirname`). It does not import any project source module.

## Notes

- The test deliberately reads the **module-local** `openapi.yaml`, not any built/bundled spec. If you restructure the file tree, the `../../openapi.yaml` path must still resolve to the correct spec.
- The two schema pairs are duplicated by design (not a bug); the only safe way to keep them in sync is this test. When adding a field to `Order` or `OrderTimelineEntry`, the corresponding export schema must be updated in the same commit or this test will fail.
- `expectMirror` treats the "bigger" schema as the one containing the extra field; the `inSource` boolean controls which side that is. Getting that flag wrong will flip the assertion direction and give a misleading diff.
