---
source: src/kernel/permissions.ts
sha256: a3f831a1df10ccf3d919dde9e1111f2aa7f839cb6bf62677456250f579038ee9
generated_at: 2026-09-23T17:55:46.635332+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/permissions.ts

## Purpose

Single source of truth for declared permission keys and preset roles. At import time it reads, parses, and Zod-validates two shared YAML files (`shared/authorization-keys.yaml`, `shared/authorization-roles.yaml`) that are also consumed byte-for-byte by the PHP twin. Everything downstream—ability resolution, middleware authorization, role lookups—draws from the constants and helpers exported here rather than re-reading the YAML.

## Key elements

- **`scopeOfKey(key)`** — Returns `'platform'` or `'tenant'` purely from the `platform.` prefix on the key string; no lookup table involved.
- **`PermissionKey` / `PresetRole`** — The two core interfaces. `PermissionKey` carries `stepUp?`, `conditions?` (ABAC filter fragments), and `deniedCode?` (actionable refusal code). `PresetRole` is the data shape seeders create.
- **`PERMISSION_KEYS`** — All declared keys, in file order. Indexed by name in a private `byKey` Map for O(1) lookups.
- **`PRESET_ROLES` / `ANONYMOUS_ROLE`** — The roles a deployment ships with; `ANONYMOUS_ROLE` is the unauthenticated identity (a value in the model, not a null).
- **`permissionModelVersion(keys)`** — SHA-256 over sorted key names, first 4 bytes as uint32. Used as the cache-busting `version` on `GET /account/abilities`; stable under reordering, changes when the *set* changes.
- **`PERMISSION_SUBJECTS`** — Deduplicated, sorted CASL subject names for client-side typing of `meta.can` rules.
- **`findRole(name)`** — Returns `RoleLookup | undefined`; undefined is expected for runtime-added roles.
- **`permissionsOfRole(name)`** — Returns the key list or **throws** on an undeclared role (fail-loud on typos).
- **`keysDocumentSchema` / `rolesDocumentSchema`** — Exported Zod schemas; exported so unit tests can validate malformed fixtures without touching the filesystem.
- **`readShared(file, schema)`** — Private; reads `shared/<file>`, parses YAML, safe-parses against the schema, throws with a `z.prettifyError` message on mismatch.

## Relationships

- **`src/kernel/ability.ts`** — Consumes `PERMISSION_KEYS`, `PRESET_ROLES`, `PERMISSION_SUBJECTS`, and `scopeOfKey` to build CASL ability rules for a caller.
- **`src/kernel/middlewares/authorizations.ts`** — Calls `findKey`/`permissionsOfRole`/`scopeOfKey` at request time to enforce rules before a handler runs.
- **`src/kernel/access/tenant.ts`** — Provides `DEPLOYMENT_TENANT_ID`, imported here for tenant-scoped resolution context.
- **`src/kernel/access/query.ts`** — Consumes `PermissionKey.conditions` to inject ABAC filter fragments into repository queries.
- **`src/modules/access/service.ts`** — Reads `PRESET_ROLES` and `ANONYMOUS_ROLE` when creating or listing roles for a deployment.
- **`src/modules/account/controllers/get-my-abilities.ts`** — Calls `permissionModelVersion` for the response `version` field and returns `PERMISSION_SUBJECTS`.
- **`src/modules/account/controllers/post-login.ts` / `post-login-2fa.ts` / `get-oauth-callback.ts`** — Resolve the caller's role via `findRole`/`permissionsOfRole` and check `stepUp` tier on the key being exercised.
- **`src/modules/account/services/oauth.ts` / `profile.ts` / `verification.ts`** — Use `findKey` and `scopeOfKey` to gate OAuth token issuance, profile edits, and verification actions.
- **`src/modules/account/tests/contract/abilities.test.ts`** — Asserts the shape of the abilities endpoint output against `PERMISSION_KEYS` and `PERMISSION_SUBJECTS`.
- **`src/modules/access/tests/integration/access.test.ts`** — Integration-tests role CRUD against the data this module exposes.
- **`scripts/docs/generate-role-matrix.ts`** — Reads `PRESET_ROLES` and `PERMISSION_KEYS` to render the role × key matrix in generated docs.

## Notes

- **Boot-time, not request-time.** The YAML is parsed exactly once at `import`. A malformed file throws at process start (same stance as `required-config.ts`); it never surfaces on the first authorization check.
- **Scope is spelling, not data.** The *only* thing separating platform from tenant is the `platform.` prefix. A bare key is tenant; a prefixed key is platform. No lookup table, no configuration.
- **No wildcards.** `manage` is deliberately absent from `PERMISSION_ACTIONS`; there is no catch-all action.
- **`permissionsOfRole` throws; `findRole` returns `undefined`.** The distinction matters: an *undeclared* role name is a bug (typo, missing migration) and should crash; a *runtime-added* role simply isn't in the preset list and `undefined` is the correct answer.
- **`deniedCode` is rare and intentional.** Only set where the caller *does* have a role but lacks this specific key and the actionable answer is more useful than "forbidden" (e.g., `cart.self.checkout` → "confirm your email").
- **Shared with PHP.** The two YAML files are the cross-language contract. Any key or role change requires updating both YAMLs; the TS and PHP sides validate against the same shapes.
- **`conditions` has no expression language.** The only substitution is `$caller.<field>`; there is no conditional logic beyond a flat key→value match spread into a query.
