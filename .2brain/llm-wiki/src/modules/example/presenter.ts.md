---
source: src/modules/example/presenter.ts
sha256: 693dbeb545f2786671b14f5b63e162259de1f54cc56b0b3d14f0290f71c1f46a
generated_at: 2026-10-29T03:53:45.378074+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/presenter.ts

## Purpose

The single place a stored row (Mongoose document or search row) is shaped into the `Example` wire contract declared in `openapi.yaml`, so every read and write path returns the same shape. It exists to keep that mapping out of the service layer.

## Key elements

- **`presentExample(document, ownerName, actions)`** — Takes a live Mongoose `ExampleDocument`, calls `.toJSON()` (applying the model's `_id → id` and owner-hex transform), spreads the result, adds `ownerName` and `actions`, and wraps with `carryVersion`. Returns `Example`.
- **`presentExampleRow(row, ownerName, actions)`** — Same shaping but for a row that is *already* in wire shape (`ExampleRow`, e.g. from a repository search). Adds `ownerName`, `actions`, applies `carryVersion`. Returns `Example`.
- **`presentExampleExport(row, ownerName)`** — Shapes a row for the account-data export: spreads the row, adds `ownerName`, and intentionally omits `actions`. Returns `ExportExample`.

## Relationships

- **`src/modules/example/model.ts`** — Source of the `ExampleDocument` and `ExampleRow` types consumed here.
- **`src/infrastructure/persistence/versioning.ts`** — Provides `carryVersion`, applied to every presenter output to attach the document's version metadata.
- **`src/types/index.ts`** — Source of the `Example`, `ExampleActions`, and `ExportExample` types that form the return-contract.
- **`src/modules/example/services/crud.ts`, `services/owner.ts`, `services/personal-data.ts`** — Callers that resolve `ownerName` (from the `users` collection) and decide `actions` before invoking these presenters.

## Notes

- The one `as ExampleRow` cast after `document.toJSON()` is load-bearing: Mongoose types `.toJSON()` as `any`, so this is the only place the result is pinned to `ExampleRow`.
- Dates are left as `Date` objects throughout; they become ISO strings only when the HTTP response is serialized. Don't "helpfully" call `.toISOString()` here.
- `ownerName` and `actions` are *always* caller-supplied. This file never queries `users` or computes permissions.
- `presentExampleExport` deliberately has no `actions` parameter — it exists for the bulk export path where per-caller permissions are irrelevant.
