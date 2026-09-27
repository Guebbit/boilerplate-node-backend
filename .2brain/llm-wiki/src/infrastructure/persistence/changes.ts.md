---
source: src/infrastructure/persistence/changes.ts
sha256: 842796321b2dc59516372740013a3e1198bd629eaf2d941dad5898601fe250f7
generated_at: 2026-09-27T14:13:35.271623+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/changes.ts

## Purpose

Small utility module that translates individual field values from an update change-set into assignments suitable for a hydrated Mongoose document before `.save()` is called.

## Key elements

- **`clearedOrValue<T>(value: T | null): T | undefined`** — The sole export. Returns the value unchanged, or `undefined` if the input was `null`. Used to turn a "clear this field" sentinel in the change-set into the form Mongoose expects for an `$unset` emission on save.

## Relationships

- **`src/modules/addresses/repository.ts`, `src/modules/feedback/service.ts`, `src/modules/products/service.ts`, `src/modules/users/service.ts`, `src/modules/webhooks/services/subscriptions.ts`** — Module-level services/repositories that build a change-set for an update and call `clearedOrValue` when assigning each field onto the hydrated document before persisting.
- **`tests/unit/infrastructure/persistence/changes.test.ts`** — Unit tests covering the `null` → `undefined` and pass-through behavior.

## Notes

- The `null` → `undefined` distinction is load-bearing: in Mongoose, assigning `undefined` to a document path makes `.save()` emit `$unset`, whereas assigning `null` stores a literal `null` in the document. `clearedOrValue` exists solely to bridge the change-set's `null`-means-clear convention to Mongoose's `undefined`-means-unset behavior.
- The function is generic but type-transparent for non-null inputs; callers don't need a separate branch for the "value is present" case.
