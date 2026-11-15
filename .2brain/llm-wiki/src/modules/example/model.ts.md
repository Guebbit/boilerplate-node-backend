---
source: src/modules/example/model.ts
sha256: 530b6fc76c169fd335cbd15935ac9dae6f0de7d67e499d69ad5ee7c3e1572cfc
generated_at: 2026-11-14T19:58:57.601543+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/model.ts

## Purpose

Defines the Mongoose schema, document type, and shared wire-shape transform for the **example** resource (a note with an owner, a status, and an optional cover). It is the single source of truth for what a row looks like in the database, on the wire, and as a contract type—used by both the repository and the presenter.

## Key elements

- **`ExampleRow`** — `Omit<Example, 'ownerName'>`; the shape every repository read returns (everything except the presenter-only `ownerName`).
- **`ExampleDocument`** — Mongoose document interface. Stores `userId` as `Types.ObjectId`, dates as native `Date`, and carries a document-only `pendingImageKey` (quarantine key for the image digest pipeline) that never appears on the wire.
- **`exampleSchema`** — Mongoose `Schema` with fields: `userId` (ObjectId, required), `title` (fallback-language string), `body`, `status` (enum from `ExampleStatus`, defaults to `draft`), `publishedAt`, `imageUrl`, `thumbnailUrl`, `pendingImageKey`. Timestamps enabled.
- **`exampleSchema.plugin(revisionPlugin)`** — attaches the edit-counter plugin that backs `ETag` / `If-Match`.
- **Index** `{ userId: 1, createdAt: -1 }` — supports the "one owner's examples, newest first" list query.
- **`applyExampleTransform`** — wraps `applySerialization`; maps `_id`→`id`, drops `__v` and `pendingImageKey`, and stringifies `userId`. Exported so lean query results (which bypass `toJSON`) use the same logic.
- **`exampleModel`** — the Mongoose `Model<ExampleDocument, ExampleModel>` entrypoint (`model('Example', exampleSchema)`).
- **`exampleTranslationFieldRules`** — Zod `strictObject` declaring `title` as the sole translatable field (optional, validated by `trimmedExampleTitle`); used by the `translatables` registry.

## Relationships

- **`src/types/index.ts`** — imports `ExampleStatus` and `Example`; `ExampleRow` is a structural subset of `Example`.
- **`src/modules/example/title-rule.ts`** — imports `trimmedExampleTitle` for the translation field rule.
- **`src/infrastructure/persistence/revision-plugin.ts`** — plugin registered on the schema; provides the revision counter for optimistic concurrency.
- **`src/infrastructure/persistence/serialize.ts`** — `applySerialization` is the factory behind `applyExampleTransform`.
- **`src/modules/example/repository.ts`** — consumes `exampleModel` and `applyExampleTransform` for all reads/writes.
- **`src/modules/example/presenter.ts`** — consumes `ExampleRow` and fills in `ownerName` (looked up from `users`).
- **`src/modules/example/factories.ts`** — uses the model/schema to construct example instances in app code.
- **`src/modules/example/module.ts`** — wires the model into the module's service graph.
- **`src/modules/example/index.ts`** — re-exports the public API of this module.
- **`src/modules/example/services/cover.ts`** — reads/writes `imageUrl`, `thumbnailUrl`, and `pendingImageKey`.
- **`src/modules/example/services/transition.ts`** — mutates `status` and `publishedAt`.
- **`src/modules/example/services/owner.ts`** — reads `userId` for ownership checks.
- **`src/modules/example/services/crud.ts`** — consumes `exampleModel` and `ExampleRow` for create/read/update/delete operations.
- **`src/modules/example/tests/unit/schema-contract.test.ts`** — asserts the schema contract (fields, types, defaults).
- **`src/modules/example/tests/factories.ts`** — builds fixture `ExampleDocument` instances.

## Notes

- `title` in the schema is the **fallback-language** value only. Other languages live in `locales` translation rows; a fallback-language write is copied back here by `repository.writeTranslatedFields`.
- `pendingImageKey` is document-only bookkeeping (image digest pipeline). It is explicitly `omit`-ed in `applyExampleTransform` and must never leak into API responses.
- `ExampleDocument` overrides the contract's string dates with native `Date` types; the serialization layer converts them back to ISO strings on the way out.
- `applyExampleTransform` is exported specifically because Mongoose **lean** results skip `toJSON`; the repository must call it manually on lean queries.
