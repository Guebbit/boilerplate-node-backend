---
source: src/modules/example/model.ts
source_sha256: 27d4fadfa606a1f4023b1bb4984f13cb03b705e02e2bab03ab934f15c4a2bb3d
context_sha256: 4531aecd6b5a12b78ba386c14c048a1366d3a01dbcbf27b59a03daf54e1f1971
generated_at: 2026-11-22T05:09:25.994226+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/model.ts

## Purpose
Defines the Mongoose schema, the single `Example` collection and the wire-shape transform shared by the example module's repository and presenter. An example is a note with an owner, a status and an optional cover image.

## Key elements
- `ExampleRow`: the contract's `Example` minus `ownerName`, which only the presenter fills from `users`. Every repository read returns this shape.
- `ExampleDocument`: the Mongoose document interface. It overrides `id`, `userId` (stored as an `ObjectId`) and the date fields (native `Date`). It also adds the document-only `pendingImageKey`, the quarantine key of an upload still waiting for its image digest job.
- `ExampleModel`: `Model<ExampleDocument>`.
- `exampleSchema`: the schema, with `timestamps: true`.
  - Fields: `userId` (required), `title` (required), `body` (required), `status` (enum from `ExampleStatus`, default `draft`), `publishedAt`, `imageUrl`, `thumbnailUrl` and `pendingImageKey`.
  - Plugin: `revisionPlugin`, which provides the edit counter behind `ETag` / `If-Match`.
  - Index: `{ userId: 1, createdAt: -1 }`, for the list screen (one owner's examples, newest first).
- `applyExampleTransform`: built with `applySerialization`. It maps `_id` to `id`, drops `__v`, omits `pendingImageKey` and turns `userId` into a string. It is exported so lean results, which bypass `toJSON`, go through the same logic.
- `exampleModel`: the registered `'Example'` model.
- `exampleTranslationFieldRules`: a strict zod object with an optional `title` using `trimmedExampleTitle`. It is the `fieldRules` for the `translatables` registry. Because `title` is not nullable, the fallback title can't be cleared through the translator.

## Relationships
- Imports `revisionPlugin` from `src/infrastructure/persistence/revision-plugin.ts` and `applySerialization` from `src/infrastructure/persistence/serialize.ts`.
- Imports `trimmedExampleTitle` from `./title-rule` and `ExampleStatus` / `Example` from `@types` (`src/types/index.ts`).
- `./repository` uses `applyExampleTransform` for lean results.
- The presenter shares the wire-shape transform and supplies `ownerName`.
- The remaining neighbors (`factories.ts`, `index.ts`, `module.ts`, the `services/*` files and the tests) are related through the dependency graph. This file's content doesn't show how they use it.

## Notes
- `title` holds only the fallback-language title. Other languages live in translation rows in `locales`. A fallback-language write is copied back to `title`.
- Dates are native `Date` objects in Mongoose and become ISO strings in the JSON response.
- `pendingImageKey` is persisted but never appears on the wire.
