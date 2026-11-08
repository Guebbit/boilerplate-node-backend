---
source: src/kernel/permissions.ts
sha256: d7c92d01059a2b471b2217e838bfc0dc8fb0e1e8ad81a7c0ed372063ef024da8
generated_at: 2026-11-08T03:54:49.584104+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/permissions.ts

## Purpose

Declares the full permission vocabulary — rules, sets, preset roles, and audience roles — by reading and validating the two shared YAML artefacts (`shared/authorization-keys.yaml`, `shared/authorization-roles.yaml`) **once at module import**. It enforces the CanCan three-layer model (rule → set → role) and acts as the single source of truth for what permissions exist, so that no deployment can invent a rule that nothing checks.

## Key elements

- **`ruleId(action, subject)`** — builds the canonical `<action>:<subject>` string (e.g. `display:Order`) used everywhere a rule is referenced.
- **`PermissionRule`** (interface + Zod schema) — one action on one subject, with optional `stepUp` tier, `conditions` (ABAC filter fragment), `deniedCode` (specific refusal code), and `credential` flag.
- **`PermissionSet`** (interface + Zod schema) — a named bundle of rule ids owned by a module.
- **`PresetRole`** (interface + Zod schema) — a role with `sets` (names) and pre-expanded `permissions` (rule ids), plus `assignable` flag.
- **`AudienceRole`** / **`AUDIENCE_NAMES`** (`guest`, `unverified`, `customer`) — the three audience tiers, each mapping sets to a flat `permissions` list. Selected per-request, never stored or granted.
- **`keysDocumentSchema`** / **`rolesDocumentSchema`** — exported Zod schemas for the full YAML documents; exported so tests can assert on malformed fixtures without hitting the filesystem.
- **`readShared(file, schema)`** (internal) — reads a file under `shared/`, parses YAML, and validates against a Zod schema; throws with the filename and `z.prettifyError` output on failure.
- **Re-exported types** from `@api/permission-vocabulary`: `PermissionAction`, `PermissionRuleId`, `PermissionSetName`, `PermissionSubject`, `StepUpTier`, `ActionOn`.

## Relationships

- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID`, which scopes platform-level rules.
- **`src/kernel/ability.ts`** — consumes the parsed rules/sets/roles to build per-request ability checks.
- **`src/kernel/middlewares/authorizations.ts`** — the enforcement middleware that calls into the ability layer; the `stepUp` and `deniedCode` fields on rules exist for this path.
- **`src/kernel/access/query.ts`** — spreads `PermissionRule.conditions` into query filters (`$caller.<field>` substitution).
- **`src/kernel/staff-read.ts`** — a concrete staff-reading permission that references rules/sets declared here.
- **`src/modules/access/services/grants.ts`** / **`memberships.ts`** — read `PresetRole.permissions` and `assignable` to grant or deny roles to accounts.
- **`src/modules/account/roles.ts`** — account-level role assignment built on the preset-role list.
- **`src/modules/account/services/account-deletion.ts`** / **`erasure-ledger.ts`** — rely on `stepUp` tier declarations (e.g. erasure demands a freshly proved session).
- **`scripts/docs/generate-role-matrix.ts`** — reads the exported schemas/data to produce the role-matrix documentation.
- **`src/modules/access/tests/unit/grantable-roles.test.ts`**, **`protection.test.ts`**, **`integration/access.test.ts`** — unit and integration tests that import the schemas and rules to assert on the permission graph.
- **`src/kernel/config.ts`** — shares the "fail at boot, not per request" stance for configuration parsing.

## Notes

- **Read once at import.** The YAML files are parsed and validated at module load; a malformed file throws immediately at boot rather than on the first authorization check. Do not import this module lazily behind a request path.
- **No wildcard action.** `manage` is deliberately absent from the action vocabulary — there is no "all actions" shortcut. A rule with an undeclared action will fail Zod validation.
- **Circular validation.** Several Zod enums (`PERMISSION_ACTIONS`, `DECLARED_SUBJECTS`, `STEP_UP_TIERS`, `PERMISSION_SET_NAMES`) are *generated from* the same YAML being validated, so at runtime the enum can never reject a value the file declares; it only narrows the TypeScript type.
- **`deniedCode` is a plain `string` in the schema** (not an enum) to avoid a circular import of `@api/error-codes` that has not been generated yet when this module loads during `contracts:bundle`. Cross-checking against the error-code catalogue is delegated to `tests/cross-cutting/authorization-keys.test.ts`.
- **`credential: false`** on a rule means it can never appear in an API key; platform-scoped rules and rules with `stepUp` are likewise un-mintable by credential, even when `credential` is absent.
- **`audience` is `z.strictObject`** — an unknown audience key in the YAML is refused outright, not silently dropped.
