---
source: src/modules/orders/tests/contract/timeline-variants.contract.test.ts
source_sha256: 6ce81fea043daef3af9816916752d87b208ee7790a90ea3f8491cff1c635ce92
context_sha256: 1fe7f992c2dfa96ec21462772b5d3585d2465af7055dfbc4aa4c638c498a002a
generated_at: 2026-11-22T06:25:40.089454+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/contract/timeline-variants.contract.test.ts

## Purpose
A contract test that keeps the hand-written timeline `oneOf` variants in the OpenAPI spec consistent. Nothing generates the variants, so the test checks that they split `OrderTimelineType` exactly, that each discriminator `mapping` names every type once, that the export surface mirrors the API surface, and that the bundled root spec closes each variant correctly.

## Key elements
- `Schema`: minimal interface for the schema fields the checks read (`enum`, `$ref`, `allOf`, `oneOf`, `properties`, `additionalProperties`, `unevaluatedProperties`, `discriminator`).
- `schemas`: `components.schemas` parsed from the orders module's own `openapi.yaml`, read relative to the test directory.
- `nameOf(ref)`: returns the last segment of a local `$ref`.
- `allTypes`: the `OrderTimelineType` enum, which the variants must partition.
- `surfaces`: for `OrderTimelineEntry`/`OrderTimelineEntryBase` and `OrderTimelineExportEntry`/`OrderTimelineExportEntryBase`, it reads each union's members, and each variant's composed base, `type` enum values and `data` schema, plus the discriminator mapping.
- `describe.each(surfaces)` checks per surface:
  - the discriminator property is `type`;
  - the variants' types partition `allTypes` with no overlap;
  - the mapping keys equal `allTypes`, each type maps to its holding variant, and the mapped values equal the `oneOf` members;
  - each variant composes its own base directly, and that base has no `allOf` of its own;
  - each variant's `data` schema exists.
- Export mirror test: the export variants have the same `types` and `data` as the entry variants.
- `withText(union)` and the `text` test: only `...NoteAdded` and `...StatusOverridden` variants declare a `text` property, with matching names on the export surface (`Entry` replaced by `ExportEntry`).
- Audience table tests: `TIMELINE_AUDIENCE.note_added` is `'staff'`, and its keys equal `allTypes`.
- Bundle closing tests: they read the root bundle `openapi.yaml`, five directory levels above the test directory, and check two things. Both bases must be defined and have no `additionalProperties`. Every variant must have `unevaluatedProperties: false` and no `additionalProperties`.

## Relationships
- `src/modules/orders/domain/index.ts`: imports `TIMELINE_AUDIENCE` from the domain barrel for the audience-table tests.
- `src/modules/orders/domain/timeline.ts`: its relationship isn't visible in this file's imports. The audience table's keys are checked against the spec's `OrderTimelineType` enum.

## Notes
- The closing rule is checked on the root bundle, not the module spec, because the bundle is what consumers read.
- Bases must stay open. A base closed with `additionalProperties: false` would reject its own variants' extra fields, so closure is applied per variant via `unevaluatedProperties` (JSON Schema 2020-12).
- The tests index into `allOf[0]` and `allOf[1]` by position, so a variant must be written as `[base ref, own branch]`.
- The tests use `toSorted()`.
