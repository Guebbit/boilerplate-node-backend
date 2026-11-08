---
source: src/modules/orders/tests/contract/timeline-variants.contract.test.ts
sha256: 66994555eded6b8c31b6ecfb5cdf416df8f8b14d95d4db340f3e4d71d5f35904
generated_at: 2026-11-08T07:02:57.916620+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/timeline-variants.contract.test.ts

## Purpose

Contract test that keeps the hand-written `oneOf` timeline variants in the module's `openapi.yaml` honest against the `OrderTimelineType` enum. It verifies that the variants split the type set exactly, that discriminator mappings are complete and correct, that the export surface mirrors the entry surface, that only approved variants carry a `text` property, that the domain audience table covers every type, and that the root (bundled) `openapi.yaml` closes variants with `unevaluatedProperties` while leaving bases open.

## Key elements

- **`Schema`** — minimal structural type covering only the fields the test inspects (`enum`, `$ref`, `allOf`, `oneOf`, `properties`, `additionalProperties`, `unevaluatedProperties`, `discriminator`).
- **`nameOf(ref)`** — extracts the trailing segment of a `$ref` string.
- **`surfaces`** — pre-computed array of two entries (`OrderTimelineEntry` / `OrderTimelineExportEntry`), each holding the union name, base name, member names, variant details (base, type enums, data `$ref`), and the discriminator mapping.
- **`describe.each(surfaces)`** — runs the same suite of assertions (discriminator property, exact type split, mapping integrity, one-level base composition, data-schema existence) against both surfaces.
- **`withText(union)`** — returns the sorted list of variant names whose `allOf[1]` branch declares a `text` property.
- **Audience-table tests** — asserts `TIMELINE_AUDIENCE.note_added === 'staff'` and that the table's keys match the contract's type set exactly.
- **Closing tests** — reads the root `openapi.yaml` and asserts bases have *no* `additionalProperties` constraint while every variant has `unevaluatedProperties: false` and no `additionalProperties`.

## Relationships

- **`src/modules/orders/domain/index.ts`** — imported for `TIMELINE_AUDIENCE`, which the audience-table tests assert against the contract's type list.
- **`src/modules/orders/domain/timeline.ts`** — source of the `TIMELINE_AUDIENCE` constant (re-exported via `domain/index.ts`); the test's audience assertions depend on its shape.
- Reads **`src/modules/orders/openapi.yaml`** (module-local) for all variant, discriminator, and composition checks.
- Reads **`openapi.yaml`** at the repository root (resolved three levels up) for the closing-rule assertions, since that is the bundle consumers actually receive.

## Notes

- The test reads **two different** `openapi.yaml` files: the module-local one for structural checks and the root bundle for closing rules. This is intentional — the root file is what a twin, integrator, or docs tool will see.
- Closing uses JSON Schema 2020-12 semantics: variants are closed via `unevaluatedProperties: false` (not `additionalProperties: false`), and bases must remain open. A closed base would reject its own `allOf` variants.
- The `text` property is deliberately restricted to `NoteAdded` and `StatusOverridden` variants; any new variant wanting `text` must update this test.
- The export surface is expected to be a structural mirror of the entry surface (same variant order, same types, same data schemas, names differing only by the `Export` infix).
