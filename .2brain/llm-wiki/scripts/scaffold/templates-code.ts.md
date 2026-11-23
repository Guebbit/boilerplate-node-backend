---
source: scripts/scaffold/templates-code.ts
source_sha256: f7ec4647d3d489753d1a23026f36ced732d8d7e18af9c36b240c1cd280bb002f
context_sha256: 42607f272025214aabc42027eacd18d4fe0f1f8da790a8ec69f1615ce525f874
generated_at: 2026-11-22T02:17:04.763423+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/templates-code.ts

## Purpose
Holds the runtime source files of a scaffolded module as plain template literals. The shape is a cut-down copy of the `example` module's core: an admin collection with a required `name` and optional `notes`, with keyed list / create / replace / patch / delete behind one permission gate. Each generated file opens with a header giving its role in any module, then what it does in this module. Prettier reformats the output, so the templates favour readability over final layout.

## Key elements
- `moduleYaml(options)`: the `module.yaml` body (escaped `summary`, `subdomain: generic`, `group`, empty `dependsOn`).
- `moduleManifest(names)`: the manifest file. It is a default-exported `AppModule` with `name`, one `mounts` entry (`basePath`, `router` from `./routes`) and `personalData: 'none'`.
- `barrel(names)`: the public barrel. It re-exports `./services` and `./domain`, and exports the types from `./model`.
- `auditEntries(names)`: builds the four audit actions (`admin.<entitySnake>.viewed|created|updated|deleted`) with descriptions.
- `rulesYaml(names)`: `rules.yaml` listing those audit entries.
- `rulesSchemaFile(names)`: a Zod `rulesSchema` plus a `rulesGenerate` spec. The spec describes the generated output file and exports `<pluralCamel>AuditActions`.
- `auditFile(names)`: the audit vocabulary. It re-exports the generated actions and augments `AuditActionMap` in `@infrastructure/observability/audit`.
- `authorizationYaml(names)`: permission rules, one per entry in `RULE_ACTIONS`, plus one permission set named by `permissionSetName(names)`. All rules have `scope: tenant`. The private `describeAction` supplies the verb phrase for each rule description.
- `modelFile(names)`: the Mongoose schema and model (`name`, `notes`, timestamps, a `createdAt: -1` index). It also emits the `<Entity>Row`, `<Entity>Document` and `<Entity>Model` types and `apply<Entity>Transform` via `applySerialization`.
- `repositoryFile(names)`: a repository built with `createRepository`, searchable over `name` and `notes`, and sortable by `createdAt` or `name`.
- `auditCall(names, options, action, extra)`: private. It emits a `recordAudit(...)` statement, or an empty string when `options.audit` is false.
- `servicesIndexFile(names)`: the start of the services folder's index file. The service object is what controllers call and the barrel publishes.

## Relationships
- `./names`: provides the `ModuleNames` spellings that every template interpolates (`kebab`, `entity`, `entityCamel`, `entitySnake`, `pluralCamel`, `words`, `basePath`). It also provides `RULE_ACTIONS` and `permissionSetName` for `authorizationYaml`.
- `./options`: supplies the `ScaffoldOptions` type. `summary` and `group` feed `moduleYaml`, and `audit` toggles `auditCall`.
- `tests/cross-cutting/guarded-steps-stay-unpublished.test.ts`: listed as a graph neighbour. No direct interaction is visible in the shown content.

## Notes
- Generated comments avoid backticks, because they would need escaping inside the template literals.
- `rulesSchemaFile` uses `String.raw` so the regex backslashes survive unescaped.
- Audit output is conditional. `rulesYaml` and `auditFile` are described as present unless the module opted out, and `auditCall` yields `''` when `options.audit` is false.
- The manifest sets `personalData: 'none'` with a comment to change it once a record names a person.
- The generated headers contain `@see` links into `docs/` that use the module's kebab name.
