---
source: scripts/scaffold/templates-code.ts
sha256: dbeff8e96ad03183c6533572b84af3ab40a65e73dbc11717d4c7300fe18b271d
generated_at: 2026-10-14T07:31:17.845611+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-code.ts

## Purpose

Holds the template-literal strings that produce the runtime source files of a scaffolded module (manifest, barrel, model, repository, service, audit, authorization YAML, `module.yaml`). Each template is shaped after the `example` module's admin-collection core and is written for readability—Prettier handles final formatting after generation.

## Key elements

- **`moduleYaml(options)`** — Returns the `module.yaml` body string (summary, subdomain, group, optional `noAudit` TODO line).
- **`moduleManifest(names)`** — Returns the default-export manifest (`AppModule` shape) with router, basePath, and `personalData: 'none'`.
- **`barrel(names)`** — Returns the public barrel: re-exports `./service` and `type * from './model'`.
- **`auditFile(names)`** — Returns the audit-action vocabulary (`as const` object) plus the `AuditActionMap` module augmentation. Emitted only when the module did not opt out of auditing.
- **`authorizationYaml(names)`** — Returns the permission-key YAML block, iterating `KEY_ACTIONS` to emit one key per action with module/subject/scope/description.
- **`modelFile(names)`** — Returns the Mongoose schema, document/model types, `applySerialization` transform, and the `createdAt: -1` index.
- **`repositoryFile(names)`** — Returns the repository built on `createRepository` with `objectIds`, `text`, and `sortable` search config.
- **`serviceFile(names, options)`** — Returns the CRUD service (create, list, replace/patch, delete) with inline audit calls; the `context?: CallerContext` parameter and `recordAudit` import appear conditionally based on `options.audit`.
- **`describeAction(action)`** (internal) — Maps an action key to a human-readable verb phrase for YAML descriptions.
- **`auditCall`, `contextParameter`, `thenAudit`, `contextDocument`** (internal) — Small helpers that emit the audit-related code fragments (or empty strings) so `serviceFile` can stay a single template literal.

## Relationships

- **`scripts/scaffold/options.ts`** — Imports `ScaffoldOptions`; the `audit` flag drives conditional inclusion of audit imports, parameters, and calls in `serviceFile` and the `noAudit` line in `moduleYaml`.
- **`scripts/scaffold/names.ts`** — Imports `KEY_ACTIONS` (iterates to build `authorizationYaml`) and the `ModuleNames` type (provides all casing variants: `kebab`, `family`, `entity`, `entityCamel`, `entitySnake`, `pluralCamel`, `words`) used throughout every template.
- **`scripts/scaffold/plan.ts`** — Consumes the exported template functions to assemble the file tree the scaffold writes to disk (implied by the module's role as the "templates" layer of the scaffold pipeline).

## Notes

- Templates deliberately avoid backticks in generated comments; the file header explains they would need escaping inside the outer template literals.
- `moduleYaml` escapes single quotes in `options.summary` by doubling them (`replaceAll("'", "''")`) for YAML safety.
- When `options.audit` is falsy, `serviceFile` omits the `CallerContext` import, the `context` parameter, and the `recordAudit` call entirely—there is no dead code or unused-parameter warning in the output.
- `describeAction` uses a lookup object with a fallback to the raw action string, so an unknown action key in `KEY_ACTIONS` would still produce a valid (if terse) description rather than `undefined`.
