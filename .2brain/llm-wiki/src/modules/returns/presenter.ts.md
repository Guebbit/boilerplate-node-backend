---
source: src/modules/returns/presenter.ts
sha256: e201c1d87a5a9e69d8f78e6d454a363b5d39ae82a643b1d8081ae895f267152b
generated_at: 2026-10-15T11:54:22.479751+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/presenter.ts

## Purpose

A single-purpose adapter that converts a stored `ReturnDocument` into the `Return` wire contract. It exists so that the document's internal shape (MongoDB `_id`, native dates) is translated to the external shape (`id`, ISO strings) in exactly one place, keeping the rest of the codebase free of manual field mapping.

## Key elements

- **`presentReturn(document: ReturnDocument): Return`** — Calls `document.toJSON()` (which handles the `_id` → `id` rename and date-to-ISO-string conversion) and casts the result to `Return`. The cast is required because TypeScript cannot infer that `toJSON()`'s return matches the `Return` interface.

## Relationships

- **`src/modules/returns/model.ts`** — Supplies the `ReturnDocument` type that `presentReturn` accepts. The document's `toJSON()` method (defined there or its base class) performs the actual field transformation.
- **`src/types/index.ts`** — Supplies the `Return` interface that `presentReturn` returns. This is the public contract callers see.
- **`src/modules/returns/services/read.ts`** — Consumes `presentReturn` to produce base `Return` objects, then layers `actions` on top before handing results to the caller.

## Notes

- The `as Return` cast is intentional, not a workaround for a bug: `toJSON()` returns a structural type that TypeScript cannot automatically narrow to `Return`. Remove the cast only if the model's return type is explicitly annotated as `Return`.
- This file is deliberately minimal. If you need to add computed fields or conditional logic, that belongs in `services/read.ts`, not here.
