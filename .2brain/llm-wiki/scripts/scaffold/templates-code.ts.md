---
source: scripts/scaffold/templates-code.ts
sha256: ac7a8ff4cec4ed235a04c441e4bf4b4b40544f6fff30f3d4a46659698a382d55
generated_at: 2026-10-01T12:40:13.009528+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-code.ts

## Purpose

Provides the set of code-file templates (as template-literal strings) that the scaffold command writes into a new module directory. The generated shape mirrors the `feedback` module's admin half: a keyed collection with CRUD behind a single permission gate. Templates are written for readability, not final formatting, because Prettier reformats the output before it hits disk.

## Key elements

- **`moduleYaml(options)`** – Returns the `module.yaml` body (summary, subdomain, group, optional `noAudit` TODO line).
- **`moduleManifest(names)`** – Returns the module's default-export manifest (name, basePath, router, `personalData: 'none'`).
- **`barrel(names)`** – Returns the public barrel that re-exports `service` and `model`.
- **`auditFile(names)`** – Returns the audit-action constants and the `AuditActionMap` augmentation; only generated when the module audits.
- **`authorizationYaml(names)`** – Returns the per-action permission keys (`any.read`, `any.create`, `any.update`, `any.delete`) as a YAML snippet.
- **`modelFile(names)`** – Returns the Mongoose schema, document/model types, `createdAt` index, serialization transform, and model registration.
- **`repositoryFile(names)`** – Returns the repository built on `createRepository` with search/sort configuration.
- **`serviceFile(names, options)`** – Returns the service layer (create, search, replace/patch, delete) with conditional audit calls.
- **Private helpers** – `describeAction`, `auditCall`, `contextParameter`, `thenAudit`, `contextDocument` build small conditional fragments so the service template can include or omit audit plumbing based on `options.audit`.

## Relationships

- **`scripts/scaffold/names.ts`** – Supplies the `ModuleNames` type (kebab, family, entity, entitySnake, entityCamel, pluralCamel, words, basePath) and the `KEY_ACTIONS` constant used to enumerate permission keys.
- **`scripts/scaffold/options.ts`** – Supplies the `ScaffoldOptions` type (summary, group, audit flag) that controls conditional branches in `moduleYaml` and `serviceFile`.
- **`scripts/scaffold/plan.ts`** – Consumes the exported template functions to assemble the file list and their string contents for the target directory.

## Notes

- Generated JSDoc comments deliberately avoid backticks; they would clash with the outer template-literal delimiters and require escaping.
- `options.audit === false` strips the `context` parameter, the `recordAudit` import, and the `CallerContext` type import entirely—leaving an unused parameter would fail the project's lint/type check.
- `moduleYaml` escapes single quotes in `options.summary` by doubling them (`''`) for YAML safety.
- The `personalData` field is hard-coded to `'none'` with a comment reminding the developer to change it if a record ever names a person.
