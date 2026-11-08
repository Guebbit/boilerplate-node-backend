---
source: src/modules/example/model.ts
sha256: 6891472ba905b43f716c50c4c18e3298b14be8a3fb843a14dd14d0f9cb68563d
generated_at: 2026-11-08T05:50:51.115860+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/model.ts

## Purpose

Defines the Mongoose schema, document interface, registered model, and shared wire-shape serialization for the **Example** entity (a note with an owner, a status, and an optional cover image). This is the single source of truth for the collection's shape and the transform both the repository and the presenter consume, keeping the persistence and presentation layers in agreement without either importing the other.

## Key elements

- **`ExampleRow`** (type) — The contract's `Example` minus `ownerName` (presenter-only). The shape every repository read returns.
- **`ExampleDocument`** (interface) — Mongoose document type: native `Date` fields, `userId` as `Types.ObjectId`, plus the document-only `pendingImageKey` bookkeeping field.
- **`ExampleModel`** (type) — `Model<ExampleDocument>` for typed model access.
- **`exampleSchema`** — Schema with fields `userId`, `title`, `body`, `status` (enum `ExampleStatus`, default `draft`), `publishedAt`, `imageUrl`, `thumbnailUrl`, `pendingImageKey`. Uses `{ timestamps: true }`, applies `revisionPlugin`, and declares a compound index `{ userId: 1, createdAt: -1 }`.
- **`applyExampleTransform`** (const) — Serialization built via `applySerialization`: maps `_id → id`, drops `__v` and `pendingImageKey`, coerces `userId` to a hex string. Exported so lean query results (which bypass `toJSON`) get the same logic.
- **`exampleModel`** (const) — Registered Mongoose model entrypoint (`model('Example', …)`).

## Relationships

- **`src/types/index.ts`** — Imports `ExampleStatus` (enum) and `Example` (contract type) to derive `ExampleRow` and constrain the schema's `status` field.
- **`src/infrastructure/persistence/revision-plugin.ts`** — Imports `revisionPlugin` and applies it to the schema; provides the edit counter backing `ETag` / `If-Match`.
- **`src/infrastructure/persistence/serialize.ts`** — Imports `applySerialization`, which `applyExampleTransform` wraps to add Example-specific omission and post-processing.
- **`src/modules/example/repository.ts`** — Consumes `exampleModel` and `applyExampleTransform` for all reads (including lean results) and writes.
- **`src/modules/example/presenter.ts`** — The only layer that resolves `ownerName` from the `users` collection; consumes the serialized `ExampleRow` shape this file produces.
- **`src/modules/example/services/cover.ts`** — Writes/clears the `pendingImageKey` field as the quarantine key for the image-digest pipeline.

## Notes

- `pendingImageKey` is **never on the wire**; it is explicitly omitted in `applyExampleTransform` and should not be exposed in any API response.
- `title` is the **fallback-language** title only. Translations for other languages live in `locales` translation rows; a fallback-language write is copied back via `repository.writeTranslatedFields`.
- `applyExampleTransform` is exported (not kept private) specifically because lean query results skip Mongoose's `toJSON` hook and need the same normalization applied manually.
- The `{ userId: 1, createdAt: -1 }` index exists for the list-screen query pattern (one owner, newest first); any new list query should check whether it can use this index before adding another.
