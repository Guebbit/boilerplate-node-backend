---
source: src/modules/example/factories.ts
source_sha256: d5d48ce67645f63e0ae9dc484618538b11fa604a44e4f701c93264ff8ee2fabf
context_sha256: 0eb0deffa4745b8f9a9f1f761258dbd0613f23f240d4da8202c881c19a773db8
generated_at: 2026-11-22T05:08:56.587116+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/factories.ts

## Purpose
Test and seed fixture builder for the `example` module. It builds a draft example row with every field defaulted, so callers only specify what matters to their case. It is reachable at `@modules/<name>/factories` and deliberately not exported from the module barrel, because it writes past the rules a service enforces.

## Key elements
- `ExampleOverrides` — input shape. `userId` (24-char hex) is required. Optional fields: `title`, `body`, `status`, `id` (pins `_id`) and `publishedAt`.
- `PinnedExample` — `Partial<ExampleDocument>` with a required `_id: Types.ObjectId`. It is for fixtures whose id must stay stable so a seed can find the same row again.
- `makeExample(overrides)` — returns a `Partial<ExampleDocument>` ready for `exampleRepository.create`. Defaults:
  - `title`: `'An example'`
  - `body`: `'What this example says.'`
  - `status`: `ExampleStatus.draft`
  - `_id` and `publishedAt` are included only when supplied.
  - `userId` and `id` are converted to `Types.ObjectId`.

## Relationships
- `src/modules/example/model.ts` — supplies the `ExampleDocument` type that the factory output is shaped against (type-only import).
- `src/types/index.ts` — supplies the `ExampleStatus` enum, used for the `draft` default.
- `src/modules/example/tests/factories.ts` and `scenarios/example.ts` — neighbors in the dependency graph. The file's own comments describe it as built for tests and seeds, so these are presumably the consumers. The file itself doesn't reference them.

## Notes
- The output is a plain partial document, not a persisted one. Persisting is left to the caller (`exampleRepository.create`).
- Passing an invalid hex string for `userId` or `id` would make `new Types.ObjectId` throw. The factory does no validation of its own.
- Leave out `publishedAt` for a draft. The factory does not tie it to `status`, so a caller can set the two inconsistently.
