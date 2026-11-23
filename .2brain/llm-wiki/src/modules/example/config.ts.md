---
source: src/modules/example/config.ts
source_sha256: 760c6c51ad27e52abbc64ad65507a18267b530d7e24e34a5e8c2412df5037fa6
context_sha256: 7e78bf924050b41d1fb09af690151635982eeb689de4ac66e7004f3da7e1a8e6
generated_at: 2026-11-22T05:06:48.158232+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/config.ts

## Purpose
Declares the environment variables the example module reads, in one typed place validated at boot. Per the file's doc comment, no other file reads `process.env`; the only setting here is the maximum length of an example's body.

## Key elements
- `exampleConfig` — result of `defineConfig({ name: 'example', shape: {...} })`; the module's slice of the environment.
  - `NODE_EXAMPLE_BODY_MAX_LENGTH` — an `int` field, default `5000`, minimum `1`, maximum `20_000`.

## Relationships
- `src/infrastructure/config/define.ts` — provides `defineConfig`, used to build `exampleConfig`.
- `src/infrastructure/config/fields.ts` — provides the `int` field helper used to declare the variable.
- `src/modules/example/module.ts` and `src/modules/example/services/crud.ts` — graph neighbors of this file. The visible content does not show how they use `exampleConfig`.

## Notes
- The doc comment carries a `@see` reference on the ownership convention ("who owns what") in the project's configuration documentation.
- To add a module setting, declare it in this `shape` rather than reading `process.env` elsewhere.
