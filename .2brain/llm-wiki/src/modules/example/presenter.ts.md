---
source: src/modules/example/presenter.ts
sha256: 11c50d9e3dccdf540515a37b8339d3106756dbf8dc9d8369c2a8f5029e4cbeaa
generated_at: 2026-10-14T15:43:20.606598+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/presenter.ts

## Purpose

The single place where a stored `Example` document or search row is shaped into the `Example` wire type declared in `openapi.yaml`. It exists so every read and write path returns the identical contract shape, and it supplies the one field the document cannot provide on its own: `ownerName` (owned by `users`, passed in by the caller).

## Key elements

- **`presentExample(document, ownerName) → Example`** — Accepts a Mongoose `ExampleDocument`, calls the model's `.toJSON()` transform (renames `_id`→`id`, formats owner as hex), casts the result to `ExampleRow`, injects `ownerName`, and wraps everything through `carryVersion`.
- **`presentExampleRow(row, ownerName) → Example`** — Accepts an `ExampleRow` that is already in wire shape (e.g. from a repository search), injects `ownerName`, and wraps through `carryVersion`. No document transform is needed.

Both functions return the `Example` type from `@types`, guaranteeing the OpenAPI contract at every call site.

## Relationships

- **`src/modules/example/model.ts`** — Source of the `ExampleDocument` and `ExampleRow` types that the presenters accept.
- **`src/infrastructure/persistence/versioning.ts`** — Provides `carryVersion`, which both presenters apply to stamp version metadata onto the response shape.
- **`src/types/index.ts`** — Source of the `Example` type (the wire contract) that both presenters return.
- **`src/modules/example/services/crud.ts`, `services/owner.ts`, `services/personal-data.ts`** — Callers that invoke `presentExample` / `presentExampleRow` and supply the `ownerName` argument (read from `users` before calling the presenter).

## Notes

- The cast `document.toJSON() as ExampleRow` is the **only** type assertion in the file; it compensates for Mongoose typing `.toJSON()` as `any`. Do not add further casts — the model's `transform` option is what guarantees the shape.
- Dates remain `Date` objects through the presenter; they become ISO strings only at JSON-serialization time (framework-level), not here.
- The two presenters exist to avoid duplicating the transform logic: use `presentExample` for Mongoose docs and `presentExampleRow` for pre-shaped rows (e.g. aggregated search results). Mixing them up will either miss the `_id`→`id` rename or double-apply it.
