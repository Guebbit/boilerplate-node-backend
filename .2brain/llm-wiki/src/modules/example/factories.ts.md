---
source: src/modules/example/factories.ts
sha256: 6e8ab0ee9005f629ed9c5b0cef61a3287ad5ab604a6f6b12000b89a42f05c0f1
generated_at: 2026-10-29T03:53:06.057278+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/factories.ts

## Purpose

Test and seed fixture builder for the `example` module. It produces a `Partial<ExampleDocument>` ready to hand to `exampleRepository.create`, intentionally bypassing the validation a service layer would enforce. It is reachable at `@modules/example/factories` and is deliberately excluded from the barrel export.

## Key elements

- **`ExampleOverrides`** (interface) — the caller-facing shape: `userId` (required), plus optional `title`, `body`, `status`, `id`, and `publishedAt`.
- **`PinnedExample`** (type alias) — `Partial<ExampleDocument>` with a guaranteed `_id: Types.ObjectId`; the shape a seed uses to look the row up again.
- **`makeExample(overrides)`** — assembles the fixture. Defaults: `title` → `'An example'`, `body` → `'What this example says.'`, `status` → `ExampleStatus.draft`. `_id` and `publishedAt` are included only when the caller supplies them (avoids writing `undefined` keys).

## Relationships

- **`src/modules/example/model.ts`** — imports the `ExampleDocument` type; the factory's return shape is a partial of that document.
- **`src/types/index.ts`** — imports `ExampleStatus` for the default status and the `status` override.
- **`src/modules/example/tests/factories.ts`** — test-scoped re-export or thin wrapper around this factory so test files can `import { makeExample }` without the full path.
- **`scenarios/example.ts`** — consumes the factory to build seeded rows for scenario setup.

## Notes

- The factory writes *past* service-level rules; it is not a general-purpose builder and should not be imported into application code.
- `id` and `publishedAt` are spread conditionally (`...(overrides.x === undefined ? {} : { x: … })`) so the resulting object has no `undefined` keys — this matters if downstream code checks key presence rather than falsiness.
- The `PinnedExample` type is exported for type-only use by seeds; `makeExample` itself returns `Partial<ExampleDocument>`, not `PinnedExample`. A seed can still cast or intersect when it needs the guaranteed `_id`.
