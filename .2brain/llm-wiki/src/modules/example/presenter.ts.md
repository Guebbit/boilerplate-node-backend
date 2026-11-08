---
source: src/modules/example/presenter.ts
sha256: 693dbeb545f2786671b14f5b63e162259de1f54cc56b0b3d14f0290f71c1f46a
generated_at: 2026-11-08T05:51:38.263705+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/presenter.ts

## Purpose

Single mapping layer that turns a stored example (Mongoose document or raw repository row) into the wire shape declared by `openapi.yaml`. It exists so every read and write path returns the identical `Example` structure, with the two fields a stored row cannot supply (`ownerName`, `actions`) injected by the caller.

## Key elements

- **`presentExample(document, ownerName, actions)`** — Accepts a Mongoose `ExampleDocument`, calls `.toJSON()` (model transform: `_id` → `id`, owner as hex), spreads the result with `ownerName` and `actions`, and wraps the whole thing in `carryVersion`. Returns `Example`.
- **`presentExampleRow(row, ownerName, actions)`** — Same shape as above but the input is already an `ExampleRow` (e.g. from a repository search), so no `.toJSON()` is needed. Returns `Example`.
- **`presentExampleExport(row, ownerName)`** — For account-data export. Spreads the row with `ownerName` only; deliberately omits `actions` (they are caller-specific, not part of the export contract). Returns `ExportExample`.

## Relationships

- **`src/types/index.ts`** — Provides the `Example`, `ExampleActions`, and `ExportExample` types that all three functions return or reference.
- **`src/infrastructure/persistence/versioning.ts`** — Supplies `carryVersion`, which attaches version metadata to the outgoing object in the two `Example`-returning functions.
- **`src/modules/example/model.ts`** — Supplies the `ExampleDocument` and `ExampleRow` types used as input parameters; also defines the `.toJSON()` transform that `presentExample` relies on.
- **`src/modules/example/services/crud.ts`**, **`services/owner.ts`**, **`services/personal-data.ts`** — Upstream callers (not imported here). The services resolve `ownerName` (owner) and decide `actions` (crud), then delegate to this file. `personal-data.ts` is the expected caller of `presentExampleExport`.

## Notes

- This file **never** fetches data. `ownerName` and `actions` are always parameters; the presenter is a pure shape-mapper. If you find yourself adding a query or DB call here, the boundary is wrong.
- The single `as ExampleRow` cast in `presentExample` is the one place Mongoose's `any`-typed `.toJSON()` is reconciled with the project's types. Do not add further casts — extend the model's type declaration instead.
- Dates remain `Date` objects through the presenter; they only become ISO strings at JSON-serialization time. Any consumer that inspects the object before serialization should expect `Date` instances.
- Convention per `docs/theory/layers.md`: one presenter per module, colocated under `modules/<name>/`.
