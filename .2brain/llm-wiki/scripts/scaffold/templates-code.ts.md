---
source: scripts/scaffold/templates-code.ts
sha256: 0a5a5bc5b2d93f562f3847ba0f76fc8b0878a1104e507d6a2bde562486e68054
generated_at: 2026-10-15T09:47:39.686530+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-code.ts

## Purpose

Provides the template functions that produce the **source-code file contents** (as plain strings) for a newly scaffolded module. Each exported function corresponds to one file in the generated module (yaml, manifest, barrel, audit, model, repository, service, etc.) and interpolates the module's names and options into the template literal. Prettier formats the output later, so the templates are written for human readability of the *template itself*, not for final code layout.

## Key elements

- **`moduleYaml(options)`** – Generates `module.yaml`. Emits a `noAudit` TODO line when the module opts out of audit.
- **`moduleManifest(names)`** – Generates the module's `index.ts` manifest (`AppModule` object with name, basePath, routes, personalData).
- **`barrel(names)`** – Generates the public barrel; re-exports `./service` values and `./model` types only.
- **`auditFile(names)`** – Generates the audit-action constants and the `AuditActionMap` module augmentation.
- **`authorizationYaml(names)`** – Generates permission-key YAML entries by iterating `KEY_ACTIONS`.
- **`modelFile(names)`** – Generates the Mongoose schema, document/model types, index, and the shared `applySerialization` transform.
- **`repositoryFile(names)`** – Generates the repository built on `createRepository`, with searchable/sortable config.
- **`serviceFile(names, options)`** – Generates the service (create, list, update, delete) with conditional audit calls and the optional `CallerContext` parameter.
- **`auditCall` / `thenAudit` / `contextParameter` / `contextDocument`** (internal) – Small helpers that emit an audit statement or an empty string depending on `options.audit`, keeping the generated service free of unused imports or parameters.
- **`describeAction(action)`** (internal) – Maps an action key to a short verb phrase for the authorization YAML description.

## Relationships

- **`./names`** – Imports `KEY_ACTIONS` (the list of action suffixes to emit in authorization YAML) and the `ModuleNames` type that supplies all spelling variants (`kebab`, `camel`, `entity`, `family`, `words`, etc.) interpolated throughout the templates.
- **`./options`** – Imports the `ScaffoldOptions` type; the `audit` flag drives conditional inclusion of audit-related imports, calls, and the `noAudit` yaml line.
- **`./plan`** – The consumer that calls these template functions to produce the file-content strings that get written to disk during the scaffold step.

## Notes

- Generated comments deliberately **avoid backticks** because they would need escaping inside the outer template literals.
- When `options.audit` is falsy, the generated service omits the `CallerContext` import, the `context` parameter, the `recordAudit` import, and all `.then(audit)` chains — preventing unused-import and unused-parameter type errors in the output.
- `moduleYaml` escapes single quotes in `options.summary` by doubling them (`''`) for YAML string safety.
- The `personalData` field in the manifest is hard-coded to `'none'` with a comment instructing the developer to change it if a record names a person.
