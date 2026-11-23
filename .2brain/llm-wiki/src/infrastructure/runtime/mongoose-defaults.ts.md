---
source: src/infrastructure/runtime/mongoose-defaults.ts
source_sha256: 750df235870053a87184a7ce1fd5fb1c0e43cf91e7ade743b15966a5eb93b151
context_sha256: 5b0e900bc24c9f630b5ae63051c4fb4b4f9640eebe27d6b04f6d396077d67d36
generated_at: 2026-11-22T03:06:21.977487+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/mongoose-defaults.ts

## Purpose
Sets Mongoose global options that are frozen when a schema is built, so they must be applied before any model module loads. The file imports only `mongoose` (no other project modules) because it sits on the first import line of every entry point.

## Key elements
- `applyMongooseDefaults(): void` — calls `mongoose.set('strictQuery', 'throw')`. It is idempotent, so any entry point may call it.

## Relationships
- `src/infrastructure/runtime/database.ts` and `src/infrastructure/runtime/mongoose-boot.ts` are neighbors in the dependency graph. The file content does not show how they use this module.
- `tests/integration/persistence/strict-query.test.ts` is the related integration test for the `strictQuery` behavior.

## Notes
- With `'throw'`, a query filter on a path the schema does not declare raises `StrictModeError`. By default such a path is stripped, so a typo like `find({ emial })` would match everything.
- It does **not** prevent operator injection (e.g. `{ $ne: … }` on a declared path). The source marks this as separate, parked hardening.
- Ordering matters: a `bulkWrite` filter reads the option as it was when the schema was built, not when the query runs. Calling this after models load would leave those filters on the old setting.
- Do not add project imports here. That would break the "first import, before any model" guarantee.
