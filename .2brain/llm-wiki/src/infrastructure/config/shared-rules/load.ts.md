---
source: src/infrastructure/config/shared-rules/load.ts
sha256: ca8b6d18e7bcb416ba3d6746d4fc0991d0ffdf047cd3c1f03446d5ce4b318f4b
generated_at: 2026-11-08T03:26:51.716010+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/load.ts

## Purpose

Loads and validates shared YAML rule tables (under `shared/rules/` or `shared/scenarios/`) against a caller-supplied Zod schema at boot time. A broken or schema-invalid file fails the process immediately rather than surfacing as a runtime request error. The module is intentionally imported via relative paths (no aliases) so it remains resolvable when the logger pulls redaction lists through it under jest's `globalSetup` chain.

## Key elements

- **`SHARED_DIRECTORY`** — Absolute path to the repo-root `shared/` directory, derived from `__dirname` (not `import.meta.url`) for the same CJS/ESM compatibility reason as `i18n/catalog.ts`.
- **`SHARED_RULES_DIRECTORY`** — Absolute path to `shared/rules/`, the default rules folder.
- **`SharedRulesFolder`** — Union type `'rules' | 'scenarios'` constraining which sub-folder of `shared/` a caller may target.
- **`loadSharedRules<T>(name, schema, folder?)`** — The sole runtime function. Reads `shared/<folder>/<name>.yaml`, parses it with the `yaml` package, runs `schema.safeParse`, and either returns the typed result or throws an `Error` that names the file and includes `z.prettifyError` output. Defaults to the `rules` folder.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — The logger reads its redaction lists via `loadSharedRules`; the module doc explicitly notes this dependency and the reason relative imports are required (logger sits on jest's `globalSetup` import chain, outside path-alias resolution).
- **`scenarios/personas-schema.ts`** — Consumes `loadSharedRules` with `folder: 'scenarios'`, supplying the Zod schema for persona files.

## Notes

- **Relative imports are load-bearing.** Do not convert to path aliases; the logger's `globalSetup` import chain will break.
- **`__dirname` over `import.meta.url`.** This file is transpiled to CJS; `__dirname` is the safe choice (same rationale as `LOCALES_DIRECTORY` in `i18n/catalog.ts`).
- **Literal-union data is not loaded here.** Values that type a literal union are generated into a committed `as const` file (see `generate-spec.ts`) rather than parsed at runtime.
- **Boot-time failure is intentional.** `parse` throws on YAML syntax errors (naming the line); schema violations throw a formatted error. Neither is caught—by design.
