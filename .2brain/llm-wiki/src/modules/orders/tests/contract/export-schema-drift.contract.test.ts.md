---
source: src/modules/orders/tests/contract/export-schema-drift.contract.test.ts
generated_at: 2026-11-22T06:25:10.708123+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/contract/export-schema-drift.contract.test.ts

## Purpose
A contract test that keeps two hand-maintained pairs of OpenAPI schemas in step. `ExportOrder` and `OrderTimelineExportEntryBase` restate `Order` and `OrderTimelineEntryBase` flat, rather than composing them with `allOf`. Closed sibling schemas can never validate together, and the Zod generator cannot compose them. Because the property lists exist twice, this test is what catches them drifting apart. It reads the module's own `openapi.yaml`, not the bundle.

## Key elements
- `ObjectSchema` (interface): minimal shape the checks use, with `properties`, optional `required`, and optional `additionalProperties`.
- `spec`: the module's `openapi.yaml`, loaded with `readFileSync` and parsed with `yaml`. It is resolved relative to `__dirname` as `../../openapi.yaml`, which is the orders module's own spec at `src/modules/orders/openapi.yaml`.
- `order`, `exportOrder`, `timelineEntry`, `timelineExportEntry`: the four schemas destructured from `components.schemas` (`Order`, `ExportOrder`, `OrderTimelineEntryBase`, `OrderTimelineExportEntryBase`).
- `expectMirror(source, exported, field, inSource)`: asserts the two schemas are equal apart from one allowed field.
  - `field` must exist on the larger schema. `inSource` says whether that is the source (`actions`) or the export (`orderId`).
  - Property names, ignoring `field`, must match when sorted.
  - `required` lists, ignoring `field`, must match when sorted.
  - Every shared property must have a deeply equal definition in both schemas.
- Test suites:
  - `ExportOrder mirrors Order`:
    - Differs only by `actions`, and `ExportOrder` has `additionalProperties: false`.
    - `Order` requires `actions`. `ExportOrder` never does.
  - `OrderTimelineExportEntryBase mirrors OrderTimelineEntryBase`:
    - Differs only by `orderId`.
    - The export entry requires `orderId`.

## Relationships
It has no graph neighbors and imports no other project files. Its only external input is the orders module's `openapi.yaml`, read from disk. The module doc comment mentions a separate test covering the timeline's variants, but that is only a comment reference.

## Notes
- The timeline base schemas are open (no `additionalProperties: false`) so they can be composed. The variants close the whole entry. Only `ExportOrder` is asserted closed here.
- The tests use `describe`/`it`/`expect` as globals, with no imports. `toSorted()` is used for order-insensitive comparison.
- The shared-field loop compares `exported.properties[name]` against `source.properties[name]` for each name in the smaller schema.
