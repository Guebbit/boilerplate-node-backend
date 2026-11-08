---
source: src/modules/orders/tests/contract/export-schema-drift.contract.test.ts
sha256: 13ce6bcf10fc969b7be3e72bdc3c2f807f8c04af8d043dc739a87d84bc33f8b9
generated_at: 2026-11-08T07:02:32.135112+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/export-schema-drift.contract.test.ts

## Purpose

Guards against drift between the API's canonical schemas (`Order`, `OrderTimelineEntryBase`) and their flat "export" restatements (`ExportOrder`, `OrderTimelineExportEntryBase`) that exist because the Zod generator cannot compose the `allOf`-based originals and closed siblings cannot validate together. The test reads the module's own `openapi.yaml` and asserts each export mirrors its source with exactly one intentional field difference.

## Key elements

- **`expectMirror(source, exported, field, inSource)`** — Core comparison helper. Verifies the two schemas have identical property sets (minus the one allowed field), identical `required` arrays (minus that field), and deep-equal definitions for every shared property.
- **`spec`** — Parsed `../../openapi.yaml` (resolved relative to `__dirname`), typed as a minimal `ObjectSchema` shape (`properties`, `required`, `additionalProperties`).
- **`describe('ExportOrder mirrors Order')`** — Asserts `ExportOrder` differs from `Order` only by the `actions` field (present/required on `Order`, absent on export) and that `ExportOrder.additionalProperties` is `false`.
- **`describe('OrderTimelineExportEntryBase mirrors OrderTimelineEntryBase')`** — Asserts the export base differs only by the `orderId` field (added/required on the export).

## Relationships

- **`src/modules/orders/openapi.yaml`** — Read directly via `readFileSync` at module load; this is the sole data source.
- **`timeline-variants.contract.test.ts`** (sibling test) — Owns assertions on the timeline *variants* layered on top of these bases; this file deliberately does not cover them.

## Notes

- The spec path is `../../openapi.yaml` relative to the test's directory, i.e. the module-level spec — not any bundled/generated copy.
- Property-order comparisons use `.toSorted()` (stable-sort) so key insertion order in the YAML is irrelevant.
- The `expectMirror` helper compares definitions of shared fields against `source.properties[name]` specifically (not the larger/smaller pair), so it always checks that the export's definition matches the source's definition even when the source has the extra field.
- The two schemas are hand-duplicated in the YAML by design; this test is the only mechanism keeping them in sync.
