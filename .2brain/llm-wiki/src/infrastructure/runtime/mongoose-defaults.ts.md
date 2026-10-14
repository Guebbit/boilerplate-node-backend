---
source: src/infrastructure/runtime/mongoose-defaults.ts
sha256: 750df235870053a87184a7ce1fd5fb1c0e43cf91e7ade743b15966a5eb93b151
generated_at: 2026-10-14T08:13:56.915122+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/mongoose-defaults.ts

## Purpose

Sets Mongoose global options that are frozen at schema-build time, so they must be applied before any model module loads. Isolated as a dependency-free module so it can occupy the first import line of every entry point without pulling in the rest of the project.

## Key elements

- **`applyMongooseDefaults(): void`** — Single export. Calls `mongoose.set('strictQuery', 'throw')` so that query filters referencing paths not declared on the schema raise a `StrictModeError` instead of being silently stripped (which would cause `find({ emial })` to match every document). Idempotent; safe to call from multiple entry points.

## Relationships

- **`src/infrastructure/runtime/mongoose-boot.ts`** — Entry-point boot sequence that calls `applyMongooseDefaults()` as part of early runtime setup, before any model is registered.
- **`src/infrastructure/runtime/database.ts`** — Database connection layer; also relies on the defaults being applied prior to schema compilation during its initialization path.
- **`tests/integration/persistence/strict-query.test.ts`** — Integration test that exercises the `strictQuery: 'throw'` behavior (e.g., asserting that a filter on an undeclared path throws rather than matching all documents).

## Notes

- This module intentionally has **zero project imports** — only `mongoose`. Any added import risks circular dependencies or pulling in model code before the option is set.
- `strictQuery: 'throw'` does **not** prevent operator injection (e.g., `{ $ne: … }` on a declared path). That hardening is tracked separately and not addressed here.
- Because Mongoose reads `strictQuery` at schema-build time (not at query-execution time), ordering matters: calling `applyMongooseDefaults()` after a schema has been compiled has no effect on that schema.
