---
source: src/infrastructure/config/shared-rules/load.ts
source_sha256: 5aca030749e24568f59ce78f6ef07bfa85935711c51e334857373bc77797abf8
context_sha256: 5e642a6852983464dcd4f81a861e307bf5ec4cd8e4dc7401c39fbc30445db590
generated_at: 2026-11-22T02:45:33.366099+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/load.ts

## Purpose
Loads a rule table shared by both backends from `shared/<folder>/<name>.yaml`, parses it, and validates it against a Zod schema once at boot. A malformed or non-conforming file throws at startup rather than failing a request.

## Key elements
- `SHARED_RULES_DIRECTORY` (exported): absolute path to the repo-root `shared/rules/` directory.
- `SharedRulesFolder` (exported type): `'rules' | 'scenarios'`, the folders under `shared/` that hold schema-checked YAML.
- `loadSharedRules<T>(name, schema, folder = 'rules')` (exported): reads `shared/<folder>/<name>.yaml` synchronously, parses it with `yaml`, and runs `schema.safeParse`. It returns the typed data, with the type coming from `z.infer` on the schema. On a schema mismatch it throws an `Error` prefixed `[shared-rules]` that names the file and includes `z.prettifyError` output. YAML syntax errors are thrown by `yaml`'s `parse`, which names the line.
- `SHARED_DIRECTORY` (private): the `shared/` root, built from `__dirname` four levels up.

## Relationships
- The logger (`src/infrastructure/adapters/logger.ts`) reads its redaction lists through this loader. That is why the file uses relative imports only. The logger sits on jest's `globalSetup` import chain, which runs outside path-alias resolution.
- The other neighbors (`scenarios/personas-schema.ts`, `src/infrastructure/http/frontend-link.ts`, `src/infrastructure/runtime/otel-sdk.ts`, `src/infrastructure/security/breached-passwords/index.ts`, `src/infrastructure/security/password-hash.ts`) are linked through the dependency graph. The file itself shows no direct interaction with them. The `'scenarios'` folder option fits schema-checked data such as personas.

## Notes
- Use relative imports only in this file. Path aliases break the jest `globalSetup` chain.
- `__dirname` is used instead of `import.meta.url`, for the same reason as `LOCALES_DIRECTORY` in `src/infrastructure/i18n/catalog.ts`.
- Data that types a literal union is not loaded at runtime. It is generated into a committed `as const` file (see `generate-spec.ts`).
- Loading is synchronous (`readFileSync`), which suits boot-time use. A missing file throws the underlying `fs` error rather than the schema error.
