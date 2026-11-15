---
source: src/modules/example/presenter.ts
sha256: 9314f7b0bfb5fa0e51c1dfd454ab7e1b08fa730d3eaebc5bcdf2faf40bfb8858
generated_at: 2026-11-14T19:59:59.062469+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/presenter.ts

## Purpose

The single place where a stored Mongoose document or repository row is shaped into the wire contract (`Example` / `ExportExample`) declared in `openapi.yaml`. It exists so that every read and write path answers with the same structure, and so that concerns the document cannot supply (`ownerName` from `users`, `actions` from the caller's service) are injected by the caller rather than fetched here.

## Key elements

- **`presentExample(document, ownerName, actions)`** — Accepts a live `ExampleDocument`, calls its Mongoose `toJSON()` transform (which handles `_id` → `id` and owner-as-hex), casts the result to `ExampleRow`, then enriches with `ownerName` and `actions`. Returns the contract's `Example`.
- **`presentExampleRow(row, ownerName, actions)`** — Same enrichment but for a row that is *already* in wire shape (e.g. a raw repository search hit), skipping the `toJSON()` step.
- **`presentExampleExport(row, ownerName)`** — Produces the account-data-export shape (`ExportExample`): the row plus `ownerName`, deliberately **without** `actions` (actions are per-caller and irrelevant to export).

All three pass through `carryVersion` (see below) except `presentExampleExport`, which returns a plain object.

## Relationships

- **`src/types/index.ts`** — Source of the `Example`, `ExampleActions`, and `ExportExample` type definitions that shape the return values.
- **`src/modules/example/model.ts`** — Provides the `ExampleDocument` and `ExampleRow` types that describe the input shapes (Mongoose doc vs. flat row).
- **`src/infrastructure/persistence/versioning.ts`** — `carryVersion` wraps every non-export result so the version stamp rides along with the wire payload.
- **`src/modules/example/services/crud.ts`** — Call site: decides the `actions` array for a given caller and passes it into `presentExample` / `presentExampleRow`.
- **`src/modules/example/services/owner.ts`** — Call site: resolves `ownerName` from the `users` collection and hands it in (the presenter never queries `users` itself).
- **`src/modules/example/services/personal-data.ts`** — Call site for `presentExampleExport` when building the account data export payload.

## Notes

- `document.toJSON()` is typed `any` by Mongoose; the single `as ExampleRow` cast in `presentExample` is the **only** type assertion in the file and is intentional.
- Dates remain `Date` objects after `toJSON()`; they become ISO strings only at the outer HTTP serialization step. Don't expect ISO dates at this layer.
- `actions` is always caller-supplied; the presenter never computes permissions. Passing `undefined` is a caller bug, not a presenter concern.
- The module docstring points to `docs/theory/layers.md` for the broader layering rationale (model → presenter → service → transport).
