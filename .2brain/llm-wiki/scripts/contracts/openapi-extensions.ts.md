---
source: scripts/contracts/openapi-extensions.ts
sha256: 1cb626b763c2ac210ca9a9db806ac3906c244091d6889bc861152f0c118f9bb9
generated_at: 2026-11-08T02:43:35.588250+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/openapi-extensions.ts

## Purpose

Implements the `x-extends` mechanism that lets one module append values to another module's enum or add variants to another module's `oneOf` union. It discovers fragment files (`openapi.<owner>.yaml`) from disk, validates them against the owner's contract, stages their schemas as `$ref`s for Redocly resolution, and merges the appended values/variants into the bundled OpenAPI document. It is a post-bundle step alongside the other steps in `openapi-bundle`.

## Key elements

- **`ExtensionFragment`** (interface) — Parsed shape of one fragment: `module`, `owner`, `file`, `extendsSchemas` (schema → appended values/names), and `schemas` (the new schema definitions the fragment ships).
- **`extensionFragments(modulesRoot?)`** — Main entry point. Walks `src/modules/*/`, picks up files matching `openapi.<owner>.yaml`, parses the `x-extends` map, and validates that the owner module and each named schema actually exist. Returns fragments in deterministic (module, then file) order.
- **`enumSourcesOf(fragments)`** — Flattens all fragments into a single `Record<string, readonly string[]>` of appended enum values per schema name, ready for the `withFilledEnums` step.
- **`checkExtensions(fragments)`** — Returns a `Step` that refuses any `x-extends` target that is neither a `oneOf` nor declares `x-enum-from: <name>`. Must run before `withFilledEnums` (which consumes the marker).
- **`withExtensionSchemas(rootText, fragments, modulesRoot?)`** — Edits the root YAML `Document` in place, inserting a `$ref` for each fragment schema so Redocly resolves (and fails on) the fragment's internal references the same way it does for any module file. Throws if a schema name already exists in the root.
- **`appendVariants`** (internal) — Pushes `$ref` entries into a union's `oneOf` and registers them in the `discriminator.mapping`, reading each variant's discriminator value from `properties.<prop>.enum[0]`.
- **`moveToEnd`** (internal) — Re-appends fragment schemas to the tail of the schema map so generators emit them last (map order is part of the output contract).

## Relationships

- **`extends-map.ts`** — Provides `parseExtendsMap` (validates the `x-extends` YAML shape) and `requireDeclared` (checks that every name a fragment appends has a corresponding schema definition in the fragment).
- **`fragments.ts`** — `readOpenApiFragment` is used by `requireOwner` to confirm the owner module actually declares the schema being extended.
- **`openapi-document.ts`** — Supplies the `OpenApiDocument` and `Step` types that this file's functions consume and produce.
- **`modules-on-disk.ts`** — Provides `MODULES_ROOT`, the default `src/modules` directory used when no explicit path is given.
- **`openapi-bundle.ts`** — Orchestrator: this file's exported steps (`checkExtensions`, `withExtensionSchemas`, and the `enumSourcesOf` output fed into the enum-filling step) are wired in as post-bundle operations after Redocly has run.
- **`tests/unit/scripts/contracts/openapi-extensions.test.ts`** — Unit tests covering discovery, validation, and merge behavior.
- **`tests/unit/scripts/contracts/analytics-browser-events.test.ts`** — Integration-style test that exercises the extension path with a realistic module fragment.

## Notes

- **Order is contractual.** `moveToEnd` exists because generators emit schemas in map order; fragment schemas must appear after all owner schemas in the output.
- **Owner is passive.** The owner module never references the extending module. Deleting the extending module's directory is the only way to revoke the extension.
- **Not OpenAPI Overlay 1.0.** The module doc explicitly calls this out: it is a custom `x-extends` step, chosen because Overlay 1.0 is OpenAPI-only and would introduce a second tool alongside the bundler's existing `x-` steps.
- **`x-enum-from` is single-use.** `checkExtensions` validates the marker before `withFilledEnums` consumes (spends) it; running the check after filling is a no-op.
- **Redocly does the ref resolution.** Fragment schemas are staged as root-level `$ref`s specifically so a broken internal ref fails the bundle identically to any module's own broken ref—no hand-rolled merge logic.
