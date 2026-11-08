---
source: src/infrastructure/runtime/mongoose-defaults.ts
sha256: 750df235870053a87184a7ce1fd5fb1c0e43cf91e7ade743b15966a5eb93b151
generated_at: 2026-11-08T03:46:53.541340+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/mongoose-defaults.ts

## Purpose

Sets Mongoose global options that are frozen at schema-build time, so they must be applied before any model module loads. The file intentionally has zero project imports to keep it safe as the very first import in every entry point.

## Key elements

- **`applyMongooseDefaults(): void`** — Sets `mongoose.set('strictQuery', 'throw')`, converting a query filter on an undeclared path from a silent no-op (match-all) into a `StrictModeError`. Idempotent; safe to call from multiple entry points.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — Calls `applyMongooseDefaults()` as its first action, ensuring the option is set before any `mongoose.model()` registration.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Same pattern: imports and invokes `applyMongooseDefaults()` before connecting or loading schemas.
- **`tests/integration/persistence/strict-query.test.ts`** — Exercises the `'throw'` behavior end-to-end, verifying that a typo'd path in a `find` filter raises rather than silently matches all documents.

## Notes

- **Ordering is critical.** The option is read when a schema is *built*, not when a query runs. Calling this after any model import is a no-op for that model.
- **Scope limitation.** `strictQuery: 'throw'` does *not* guard against operator injection (e.g. `{ $ne: … }` on a *declared* path). That hardening is explicitly out of scope and parked.
- **No side effects beyond the single `mongoose.set` call.** The file has no state, no async work, and no further project dependencies—by design, so it can sit on import line 1 without pulling in the rest of the graph.
