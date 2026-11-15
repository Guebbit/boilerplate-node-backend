---
source: src/modules/returns/presenter.ts
sha256: affe9c53afac44b7ba4652f2ac5691149ad9163515e116c12ed369c767b42b69
generated_at: 2026-11-14T21:35:35.440349+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/presenter.ts

## Purpose

Transforms a stored `ReturnDocument` into the wire-contract shapes (`Return`, `ReturnListItem`). It sits between the model layer and the API types, handling the `toJSON()` id/date remap and selecting the field subset each endpoint exposes. The read service (`services/read.ts`) builds on this to append the caller-specific `actions`.

## Key elements

- **`StoredReturn`** (type) — `Omit<Return, 'actions'>`. The return in its stored-read-back shape before the read service attaches `actions`.
- **`presentReturn(document)`** — Calls `document.toJSON()` and casts the result to `StoredReturn`. This is the single point where the model's `_id` → `id` / date → ISO-string transform is acknowledged to the type system.
- **`presentReturnListItem(returned, actions)`** — Projects a `StoredReturn` + `ReturnActions` into a `ReturnListItem`, keeping only the columns a list table renders (id, order refs, status, reason, kind, timestamps, actions). Deliberately omits customer note, decline message, and line items.

## Relationships

- **`src/types/index.ts`** — Imports the `Return`, `ReturnActions`, and `ReturnListItem` contract types that this file projects onto.
- **`src/modules/returns/model.ts`** — Imports the `ReturnDocument` type; this file is the consumer of the model's document shape.
- **`src/modules/returns/services/read.ts`** — Builds on `presentReturn` / `presentReturnListItem` to add the `actions` field before responding to callers.

## Notes

- The `as StoredReturn` cast in `presentReturn` is load-bearing: `toJSON()` returns a structurally different object (renamed `_id`, serialized dates) that TypeScript cannot verify against `StoredReturn` without the explicit assertion.
- `presentReturnListItem` is intentionally narrow — if a new column is needed in the list view, add the field here; detail fields (note, decline message, lines) are scoped to the audited detail read and should not leak into this projection.
