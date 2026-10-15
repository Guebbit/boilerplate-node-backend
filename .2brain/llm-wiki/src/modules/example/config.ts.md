---
source: src/modules/example/config.ts
sha256: 45d4feea3bd6f7ed696e6db8aa744c81aefc8aeb3e064993ac76c7a5b1ae4d33
generated_at: 2026-10-15T10:29:58.663930+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/config.ts

## Purpose

Declares and validates the example module's slice of the environment at boot. It is the **only** file in the module that reads `process.env`; every other file consumes the typed values it exports.

## Key elements

- **`exampleConfig`** (exported const) — the result of `defineConfig({ name: 'example', shape: { … } })`. Exposes a validated, typed handle to the module's environment variables.
- **`NODE_EXAMPLE_BODY_MAX_LENGTH`** (field definition) — an `int` field (from `@infrastructure/config/fields`) with `default: 5000`, `min: 1`, `max: 20_000`. Controls the maximum allowed body length in the example module.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, the function that registers the module's env-var shape and returns a typed config object.
- **`src/infrastructure/config/fields.ts`** — provides the `int` field constructor used to declare `NODE_EXAMPLE_BODY_MAX_LENGTH`.
- **`src/modules/example/module.ts`** — the module entry point; imports `exampleConfig` to wire validated values into the module's lifecycle.
- **`src/modules/example/services/crud.ts`** — consumes `NODE_EXAMPLE_BODY_MAX_LENGTH` (via `exampleConfig`) to enforce the body-length limit during CRUD operations.

## Notes

- The "no other file reads `process.env`" rule is enforced by convention (see `docs/tools/configuration.md`). If you need a new env var for this module, add it here—do not reach for `process.env` elsewhere.
- The field is an `int`, not a generic string; passing a non-numeric value will fail at boot rather than at first use.
