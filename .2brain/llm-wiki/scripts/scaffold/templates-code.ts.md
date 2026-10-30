---
source: scripts/scaffold/templates-code.ts
sha256: 486b4483d7d43d60ded72c7f9b99ef049f195444649c1e2f7402c8d4c0ccada6
generated_at: 2026-10-29T01:44:16.761694+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-code.ts

## Purpose

Provides the template strings for every runtime source file a scaffolded module ships with. Each export is a function that, given `ModuleNames` (and sometimes `ScaffoldOptions`), returns the file's contents as a string. The scaffolder writes these into the new module's directory; Prettier formats them afterward. The templates are modelled on the `example` module's core, cut to an admin-scoped keyed collection.

## Key elements

- **`moduleYaml(options)`** – Builds the `module.yaml` body (summary, subdomain, group, audit opt-out note).
- **`moduleManifest(names)`** – Emits the module's `index.ts` manifest (AppModule default export with router mount and `personalData`).
- **`barrel(names)`** – Emits the public barrel (`export *` for services, domain, model types).
- **`auditEntries(names)`** – Returns the four `{ value, description }` pairs (viewed/created/updated/deleted) for `rules.yaml`.
- **`rulesYaml(names)`** – Renders `rules.yaml` with the audit list.
- **`rulesSchemaFile(names)`** – Renders the Zod schema + `GenerateSpec` that `npm run regenerate` consumes to produce `rules.generated.ts`. Uses `String.raw` to avoid backtick-escaping issues.
- **`auditFile(names)`** – Renders `audit.ts` (re-exports generated actions and augments the app-wide `AuditActionMap`).
- **`authorizationYaml(names)`** – Renders the authorization rules YAML (per-action rules + one permission set).
- **`describeAction(action)`** – Private helper mapping an action verb to its human-readable phrase for YAML descriptions.
- **`modelFile(names)`** – Renders the Mongoose schema/model file (type, schema, index, serialization transform, model entry).
- **`repositoryFile(names)`** – Renders the repository file built on the shared `createRepository` factory.
- **`auditCall(names, options, action, extra)`** – Private helper returning a `recordAudit(...)` statement, or `''` when the module opted out of auditing.
- **`servicesIndexFile(names)`** – Renders the service-layer index (truncated in view; exposes CRUD + action-availability helpers).

## Relationships

- **`scripts/scaffold/names.ts`** — Imports `RULE_ACTIONS`, `permissionSetName`, and the `ModuleNames` type. All templates consume `names` to interpolate entity/kebab/snake/camel spellings.
- **`scripts/scaffold/options.ts`** — Imports `ScaffoldOptions`; used by `moduleYaml` and `auditCall` to honour the `audit` opt-out flag.
- **`scripts/scaffold/plan.ts`** — The consumer that calls each template function in sequence to assemble the ordered list of file-write operations for the scaffold.
- **`tests/cross-cutting/guarded-steps-stay-unpublished.test.ts`** — Validates that scaffolded output (including the guard/authorization YAML produced by `authorizationYaml`) keeps steps unpublished until explicitly promoted.

## Notes

- Generated comments deliberately avoid backticks; they would collide with the outer template-literal delimiter. `String.raw` is used in `rulesSchemaFile` for the same reason.
- Templates are written for human readability, not final formatting — Prettier rewrites the output after it is written to disk.
- The `options.audit` flag is the single switch that strips all audit-related output (the `noAudit` line in `module.yaml`, the `recordAudit` calls in services, and the presence of `audit.ts` / `rules.yaml` in the plan).
- `describeAction` falls back to the raw action string for unknown verbs rather than throwing, so adding a new rule action to `RULE_ACTIONS` degrades gracefully.
