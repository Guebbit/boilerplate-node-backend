---
source: src/modules/example/factories.ts
sha256: 6e8ab0ee9005f629ed9c5b0cef61a3287ad5ab604a6f6b12000b89a42f05c0f1
generated_at: 2026-11-08T05:50:19.455217+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/factories.ts

## Purpose

Builds ready-to-insert `ExampleDocument` fixtures for tests and seeds. It exists outside the service layer so callers can write rows directly via `exampleRepository.create`, bypassing the validation and invariants a service would enforce.

## Key elements

- **`ExampleOverrides`** — Input interface for `makeExample`. `userId` is required; `title`, `body`, `status`, `id`, and `publishedAt` are optional with sensible defaults.
- **`PinnedExample`** — A convenience type alias for a fixture whose `_id` is fixed, used when a seed must look the row up later.
- **`makeExample(overrides)`** — Returns a `Partial<ExampleDocument>` with every field defaulted (status → `draft`, title/body → fixed strings). Conditionally includes `_id` and `publishedAt` only when the caller supplies them, avoiding `undefined` keys on the document.

## Relationships

- **`src/modules/example/model.ts`** — Provides the `ExampleDocument` type that shapes both the return value of `makeExample` and the `PinnedExample` alias.
- **`src/types/index.ts`** — Source of the `ExampleStatus` enum used as the default `status` value.
- **`src/modules/example/tests/factories.ts`** — Consumes `makeExample` (and `ExampleOverrides`) to build fixtures inside test suites.
- **`scenarios/example.ts`** — Builds seed rows via `makeExample`, relying on the `id` override to pin `_id` for later lookups.

## Notes

- This file is intentionally **not** re-exported from the module barrel. Import it directly via `@modules/example/factories`.
- `makeExample` never sets `publishedAt` unless the caller passes it; a `draft` row has no publish timestamp by design.
- `PinnedExample` is a standalone alias and is **not** returned by `makeExample`; it exists as a type annotation for consumers that need to reference the pinned shape without calling the factory again.
