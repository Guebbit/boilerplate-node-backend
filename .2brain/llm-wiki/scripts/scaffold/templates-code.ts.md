---
source: scripts/scaffold/templates-code.ts
sha256: 7c1e858804c9d3e2fa2bd08f1f42292b5cf240a0eba38058fe13476abfb8f4da
generated_at: 2026-11-08T03:01:06.743947+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-code.ts

## Purpose

Provides the runtime code templates for a scaffolded admin-collection module. Each exported function returns the full source text of one generated file (manifest, model, repository, services barrel, audit wiring, YAML configs, etc.), parameterized by the module's names and scaffold options. The collection mirrors the `example` module's core shape, cut to a single keyed collection with CRUD behind one permission gate.

## Key elements

- **`moduleYaml(options)`** – Generates the `module.yaml` body; conditionally emits a `noAudit` TODO when audit is opted out.
- **`moduleManifest(names)`** – Generates the module's `index.ts` manifest (name, mounts, `personalData: 'none'`).
- **`barrel(names)`** – Generates the public barrel; exports services, domain, and model types only.
- **`auditEntries(names)`** – Returns the four audit action entries (`viewed`, `created`, `updated`, `deleted`) as `{ value, description }` pairs.
- **`rulesYaml(names)`** – Generates `rules.yaml` with the audit list.
- **`rulesSchemaFile(names)`** – Generates the Zod schema and `GenerateSpec` for `rules.yaml` → `rules.generated.ts`. Uses `String.raw` to avoid backtick escaping.
- **`auditFile(names)`** – Generates `audit.ts` with the `AuditActionMap` declaration-merging.
- **`authorizationYaml(names)`** – Generates `authorization.yaml` with per-action rules and a single permission set.
- **`modelFile(names)`** – Generates the Mongoose schema, document/model types, serialization transform, and collection index.
- **`repositoryFile(names)`** – Generates the repository built on `createRepository` with text/sort search over `name` and `notes`.
- **`servicesIndexFile(names, options)`** *(truncated in sample)* – Generates the service folder's `index.ts` (CRUD + actions list).
- **`auditCall(names, options, action, extra)`** *(private)* – Emits a single `recordAudit(…)` statement or an empty string when audit is disabled.
- **`describeAction(action)`** *(private)* – Maps an action key to a human-readable verb phrase for YAML descriptions.

## Relationships

- **`scripts/scaffold/names.ts`** – Source of the `ModuleNames` type and the `RULE_ACTIONS` / `permissionSetName` helpers that parameterize every template's naming.
- **`scripts/scaffold/options.ts`** – Provides the `ScaffoldOptions` type (e.g., `audit` flag, `summary`, `group`) that controls conditional template output.
- **`scripts/scaffold/plan.ts`** – Consumes these template functions to assemble the ordered list of files the scaffold will write.
- **`tests/cross-cutting/guarded-steps-stay-unpublished.test.ts`** – Validates that the barrel template (and the service layer it exposes) keeps guarded/internal steps out of the public surface.

## Notes

- Templates are written for **readability**; Prettier reformats the emitted files, so indentation inside the literals is not the final layout.
- Generated comments deliberately **avoid backticks** because they would need escaping inside the outer template literals.
- `rulesSchemaFile` uses `String.raw` specifically to sidestep backtick-escaping issues.
- The `noAudit` line in `moduleYaml` is a `''`-escaped single-quote in YAML, not a missing quote—easy to misread.
- `auditCall` returns an **empty string** (not a comment) when audit is opted out; callers must handle the blank line or trim it.
