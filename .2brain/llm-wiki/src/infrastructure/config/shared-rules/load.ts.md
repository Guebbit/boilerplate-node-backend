---
source: src/infrastructure/config/shared-rules/load.ts
sha256: 3a4cad642ec427d2ebc54b062da95d78c459179cfb593dc6bb68a2292b19f5c2
generated_at: 2026-11-14T17:57:53.157183+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/load.ts

## Purpose

Boot-time loader for YAML rule files stored in the repo-root `shared/` directory. It reads a named file, parses it with `yaml`, and validates it against a caller-supplied Zod schema. Validation failure throws immediately so a broken rules file crashes the process at startup rather than surfacing as a per-request error. Both backend services consume the same files through this single entry point.

## Key elements

- **`SHARED_RULES_DIRECTORY`** (exported const) — Resolved path to `shared/rules/`, computed from `__dirname` traversed four levels up. Exposed so other modules can reference the directory without re-deriving it.
- **`SharedRulesFolder`** (exported type) — Union `'rules' | 'scenarios'` constraining which subfolder under `shared/` a file may be read from.
- **`loadSharedRules<T>(name, schema, folder?)`** (exported function) — Core loader. Resolves `shared/<folder>/<name>.yaml`, parses it, runs `schema.safeParse`, and either returns the typed data or throws an `Error` whose message includes the file path and `z.prettifyError` output. Defaults `folder` to `'rules'`.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — The logger reads its redaction lists through this module (stated in the file's own doc comment). This creates a dependency where logger → load.ts, and is the reason this file uses relative imports and `__dirname` rather than path aliases: the logger sits on Jest's `globalSetup` import chain, which runs outside alias resolution.
- **`scenarios/personas-schema.ts`** — Supplies a Zod schema that callers pass into `loadSharedRules` with `folder: 'scenarios'`, enabling schema-checked loading of persona/scenario YAML files.

## Notes

- **`__dirname`, not `import.meta.url`** — Deliberate choice (same rationale as `i8n/catalog.ts`'s `LOCALES_DIRECTORY`). Avoids the `file://` URL parsing that breaks under Jest's `globalSetup` environment.
- **Relative imports only** — The module must stay free of path-alias imports for the same `globalSetup` reason. Adding an alias import here will silently break the logger's redaction loading under tests.
- **Literal-union data is not loaded here** — If a rules file's shape is a closed literal union, it is expected to be generated into a committed `as const` file (see `generate-spec.ts`) rather than loaded at runtime through this function.
- **`yaml.parse` throws on syntax errors** — A malformed YAML file produces a syntax error (with line number) before Zod validation is ever reached; the error message will not carry the `[shared-rules]` prefix.
