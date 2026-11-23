---
source: src/kernel/permissions.ts
source_sha256: 73943760b07ab07719718ae629b77bbd51ac04d87a5e85e8027145cc2ce96e92
context_sha256: c47ca270d9c5ffcad9b36bfb8cf45cf4c13df3357569b96703abb524aaf9ce1a
generated_at: 2026-11-22T03:14:10.416563+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/permissions.ts

## Purpose
Loads and validates the two shared authorization artefacts, `shared/authorization-keys.generated.yaml` and `shared/rules/authorization-roles.yaml`. These are the same files the PHP twin reads. It exposes the declared permission rules, named sets of rules, preset roles and audience roles. The model is CanCan/Solidus-style: a rule is one action on one subject, a set bundles rules, and a role lists sets. Roles are data and permissions are code. A deployment cannot invent a rule, and the module header names `assertDeclared` as where that is enforced.

The files are read once at import, not per request. A malformed file therefore throws at boot rather than on the first request that needs it.

## Key elements
- `ruleId(action, subject)`: builds the `<action>:<subject>` id (e.g. `display:Order`) used everywhere rules are listed.
- `PermissionRule`: a declared rule with `module`, `subject`, `action`, `scope` and `description`. Optional fields:
  - `stepUp`: a recent-session tier.
  - `conditions`: ABAC filter fragment, with `$caller.<field>` substitution.
  - `deniedCode`: a custom `errors[].code` for refusals.
  - `credential`: `false` means it cannot be minted onto a credential.
- `PermissionSet`: a named bundle of rule ids, owned by a module.
- `PresetRole`: a seeded role with `name`, `scope`, `title`, `description`, `sets`, expanded `permissions`, and an optional `assignable` flag. `assignable: false` marks roles like `system`.
- `AUDIENCE_NAMES` / `AudienceName`: `guest`, `unverified` and `customer`. These are never stored or granted. `audienceOf` picks one per request from the session and the account's `verifiedAt`.
- `AudienceRole`: an audience declared as a list of sets plus its expanded permissions.
- `keysDocumentSchema` / `rolesDocumentSchema`: exported Zod schemas for the two YAML files. Unit tests can use them on malformed fixtures. The roles schema's `audience` block is strict, so an unknown audience is refused.
- Re-exported types from `@api/permission-vocabulary`: `PermissionAction`, `PermissionRuleId`, `PermissionSetName`, `PermissionSubject`, `StepUpTier` and `ActionOn`.
- Private `readShared(file, schema)`: parses a YAML file under the repo-root `shared/` directory, which it resolves relative to `__dirname`. On a shape error it throws an error naming the file and every Zod issue. The two parsed documents are `keysDocument` and `rolesDocument`.

## Relationships
- Imports `DEPLOYMENT_TENANT_ID` from `@kernel/access/tenant`.
- Imports the generated vocabulary lists (actions, subjects, set names, scopes, step-up tiers) from `@api/permission-vocabulary`. The Zod schemas are built from these.
- Imports caller and authorization types (`AuthContext`, `Caller`, `AuthorizationScope` and others) from `@types`.
- The other listed neighbors are not shown in the visible part of the file, so this page does not describe how they use it. They include `ability.ts`, `src/kernel/middlewares/authorizations.ts`, the access services, `roles.ts` and the scripts under `scripts/contracts` and `scripts/docs`.

## Notes
- `manage` is deliberately not an action, because there is no wildcard.
- The `deniedCode` value is typed as a plain `string`. It is checked against the error-code catalogue in `tests/cross-cutting/authorization-keys.test.ts`, not here. Importing `@api/error-codes` here would create an ordering cycle with `npm run regenerate`, whose `contracts:bundle` step loads this module before that catalogue exists.
- Several Zod enums are circular at runtime, because the generated lists are the YAML's own keys. They only narrow the types and cannot reject a value the YAML declares.
- A rule's `stepUp` tier is a property of the rule, not of a route. A credential can never satisfy `stepUp` rules or platform rules.
- No two declared rules share an id, and this is checked when the file is read.
