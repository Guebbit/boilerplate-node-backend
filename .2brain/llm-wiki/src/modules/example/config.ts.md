---
source: src/modules/example/config.ts
sha256: 45d4feea3bd6f7ed696e6db8aa744c81aefc8aeb3e064993ac76c7a5b1ae4d33
generated_at: 2026-11-08T05:48:14.594487+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/config.ts

## Purpose

Declares the single source of truth for the example module's environment variables. Every env var the module reads is typed, validated, and given defaults here at boot; no other file in the module touches `process.env` directly.

## Key elements

- **`exampleConfig`** (exported const) — the module's config object created via `defineConfig`. Exposes:
  - `NODE_EXAMPLE_BODY_MAX_LENGTH` — an `int` field (default `5000`, min `1`, max `20 000`) representing the maximum body length an example may have.

## Relationships

- **`@infrastructure/config/define`** (`src/infrastructure/config/define.ts`) — provides `defineConfig`, the factory that wraps a field shape into a validated, typed config object.
- **`@infrastructure/config/fields`** (`src/infrastructure/config/fields.ts`) — provides the `int` field descriptor used to type/range-check the single variable.
- **`src/modules/example/module.ts`** — module entry point that registers or wires the example module; consumes `exampleConfig` so downstream code gets validated values without re-reading the environment.
- **`src/modules/example/services/crud.ts`** — the CRUD service layer that reads `NODE_EXAMPLE_BODY_MAX_LENGTH` from `exampleConfig` when enforcing the body-length limit.

## Notes

- The module is intentionally minimal (one field) to serve as a **reference example** for how other modules should declare their env vars. New modules should mirror this file's structure: one `defineConfig` call, named fields, no raw `process.env` elsewhere.
- The max is expressed with an underscore separator (`20_000`) for readability; it is a pure numeric literal, not a string.
- See `docs/tools/configuration.md` (referenced in the file's JSDoc) for the broader convention behind this pattern.
