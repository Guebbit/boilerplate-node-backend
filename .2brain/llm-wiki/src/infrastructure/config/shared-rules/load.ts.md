---
source: src/infrastructure/config/shared-rules/load.ts
sha256: ca8b6d18e7bcb416ba3d6746d4fc0991d0ffdf047cd3c1f03446d5ce4b318f4b
generated_at: 2026-10-29T01:59:30.066442+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/load.ts

## Purpose

Boots a shared YAML rule table (under the repo-root `shared/` directory) by parsing the file and validating it against a caller-supplied Zod schema. Validation happens once at process start so a malformed or type-incompatible file crashes boot rather than surfacing as a per-request failure.

## Key elements

- **`SHARED_DIRECTORY`** – Absolute path to the repo-root `shared/` folder, resolved via `__dirname` (see Notes).
- **`SHARED_RULES_DIRECTORY`** – Convenience constant for `shared/rules/`.
- **`SharedRulesFolder`** – Union type `'rules' | 'scenarios'` that selects which sub-directory `loadSharedRules` reads from.
- **`loadSharedRules<T>(name, schema, folder?)`** – Reads `<folder>/<name>.yaml`, parses it with the `yaml` package, runs `schema.safeParse`, and returns the typed document. On failure it throws an `Error` whose message includes the file path and `z.prettifyError` output listing every schema issue.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – The logger calls `loadSharedRules` to load its redaction-list YAML at boot. The module docstring notes the logger sits on jest's `globalSetup` import chain, which is why this module uses relative imports instead of path aliases.
- **`scenarios/personas-schema.ts`** – Provides a Zod schema consumed by `loadSharedRules` with `folder: 'scenarios'` to validate persona definition YAML.

## Notes

- **`__dirname`, not `import.meta.url`:** Chosen deliberately because the logger (a downstream consumer) is loaded through jest's `globalSetup` path, where ESM `import.meta` resolution is unavailable. Same rationale as `i18n/catalog.ts`.
- **Relative imports only:** The module docstring flags that path-alias imports (`@/…`) would break in the `globalSetup` context; all imports here are bare-specifier or relative.
- **Literal-union data is not loaded here:** Values that would type a literal union are expected to be pre-generated into a committed `as const` file (see `generate-spec.ts`); `loadSharedRules` only handles data validated by a Zod schema.
- **Fail-fast contract:** A YAML syntax error (thrown by `yaml.parse`) or a schema mismatch both result in an uncaught exception at boot—there is no silent fallback or caching layer.
