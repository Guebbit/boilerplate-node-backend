---
source: src/modules/example/model.ts
sha256: 6891472ba905b43f716c50c4c18e3298b14be8a3fb843a14dd14d0f9cb68563d
generated_at: 2026-10-14T15:42:37.415117+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/model.ts

## Purpose

Defines the Mongoose schema, document/model types, and shared wire-shape transform for the "example" resource (a note with an owner, status, and optional cover image). Every other file in the module reads or writes this collection through the exports here, so the schema and serialization rules live in one place.

## Key elements

- **`ExampleRow`** — The `Example` contract type minus `ownerName` (filled only by the presenter). This is the shape every repository read returns.
- **`ExampleDocument`** — Mongoose document interface. Overrides `id`, `userId` (→ `Types.ObjectId`), and date fields (→ native `Date`). Adds `pendingImageKey`, a document-only quarantine key for the image-digest pipeline that never appears on the wire.
- **`ExampleModel`** — Convenience type alias for `Model<ExampleDocument>`.
- **`exampleSchema`** — The schema definition. Fields: `userId` (ObjectId, required), `title` (fallback-language string), `body`, `status` (enum from `ExampleStatus`, defaults to `draft`), `publishedAt`, `imageUrl`, `thumbnailUrl`, `pendingImageKey`. Uses `timestamps: true`, applies `revisionPlugin` (ETag / `If-Match` counter), and indexes `{ userId: 1, createdAt: -1 }` for the per-owner list query.
- **`applyExampleTransform`** — Built via `applySerialization`. Normalizes a serialized doc: renames `_id` → `id`, drops `__v`, removes `pendingImageKey`, and converts `userId` to a hex string. Exported so the repository can run lean query results (which bypass `toJSON`) through the same logic.
- **`exampleModel`** — The registered Mongoose model (`'Example'`), the entrypoint for all persistence operations.

## Relationships

- **`src/types/index.ts`** (`@types`) — Source of the `Example` contract type and the `ExampleStatus` enum used in the schema's `enum` constraint and default.
- **`src/infrastructure/persistence/revision-plugin.ts`** — Imported as `revisionPlugin` and applied to `exampleSchema`; provides the monotonically-increasing revision counter behind `ETag` / `If-Match`.
- **`src/infrastructure/persistence/serialize.ts`** — Imported as `applySerialization`; builds `applyExampleTransform` with the module-specific `omit` and `after` hooks.
- **`src/modules/example/repository.ts`** — Consumes `exampleModel`, `ExampleDocument`, and `applyExampleTransform` (explicitly called out in the transform's doc comment for lean-query results).
- **`src/modules/example/presenter.ts`** — Consumes `ExampleRow` / `ExampleDocument` shapes and is the sole component that resolves `ownerName` from `users` to complete the `Example` contract.
- **`src/modules/example/services/cover.ts`** — The `pendingImageKey` field exists specifically as bookkeeping for the image-digest / quarantine pipeline that the cover service manages.

## Notes

- `title` is the **fallback-language** title only. Other-language values live in a separate `locales` translation collection; a fallback-language write is also copied back into `title` by `repository.writeTranslatedFields`.
- `pendingImageKey` is schema-level but **must never** leak into API responses — it is handled by the `omit` list in `applyExampleTransform`. If you add a new document-only field, add it to that `omit` array.
- Dates are native `Date` in the document but ISO strings on the wire; the transform (or Mongoose's default serialization) handles the conversion. Don't compare against string dates in queries.
- The `id` field is not a real Mongoose field; it is produced by serialization from `_id`. Code that reads lean results must go through `applyExampleTransform` to get the correct shape.
