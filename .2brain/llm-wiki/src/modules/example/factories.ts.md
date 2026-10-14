---
source: src/modules/example/factories.ts
sha256: 02eee8837430470f47beec3f65d9e806df567847ba382c5cc2069c4de26ebc43
generated_at: 2026-10-14T15:42:11.773683+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/factories.ts

## Purpose

Provides a single factory function (`makeExample`) that builds partial `ExampleDocument` objects ready for `exampleRepository.create`. It exists so that tests and seeds can construct fixtures without going through the service layer (which enforces domain rules the fixture does not need to satisfy). Exposed at the path alias `@modules/example/factories`; deliberately excluded from the module barrel.

## Key elements

- **`ExampleOverrides`** (interface) — the input contract for `makeExample`. `userId` is required (24-char hex); all other fields (`title`, `body`, `status`, `id`, `publishedAt`) are optional and fall back to defaults.
- **`PinnedExample`** (type) — a `Partial<ExampleDocument>` with a guaranteed `_id: Types.ObjectId`. Describes the shape a seed needs in order to look the row back up by id.
- **`makeExample(overrides)`** (function, the sole runtime export) — spreads conditional `_id`/`publishedAt` keys, coerces `userId` to an `ObjectId`, and applies the defaults: title `"An example"`, body `"What this example says."`, status `ExampleStatus.draft`.

## Relationships

- **`src/modules/example/model.ts`** — imports the `ExampleDocument` type; `makeExample`'s return type is `Partial<ExampleDocument>`.
- **`src/types/index.ts`** — imports `ExampleStatus` (re-exported from `@types`) for the default status value.
- **`src/modules/example/tests/factories.ts`** — tests the factory itself (expected values, id pinning, optional-field behaviour).
- **`scenarios/example.ts`** — consumes `makeExample` to build fixtures within higher-level scenario tests.

## Notes

- The module is intentionally **not** re-exported from the barrel; import it via the `@modules/example/factories` alias.
- `publishedAt` and `_id` are only present in the output object when the caller explicitly supplies them — absent keys are omitted entirely rather than set to `undefined`, keeping the partial document clean for the repository.
- `PinnedExample` is a type-only export with no runtime counterpart; use it to annotate the return of `makeExample` when the caller needs the `_id` guarantee (e.g., a seed script that queries by id later).
