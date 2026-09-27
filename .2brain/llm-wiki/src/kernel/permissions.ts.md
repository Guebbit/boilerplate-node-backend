---
source: src/kernel/permissions.ts
sha256: 440266bb88dfd3dbd9aa9ad30da0fd8ec19d3937fa05d56d475c7009230ad8be
generated_at: 2026-09-27T14:19:25.820043+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/permissions.ts

## Purpose

Defines the permission-key and preset-role model for the entire authorization system by reading and validating two shared YAML artefacts (`shared/authorization-keys.yaml`, `shared/authorization-roles.yaml`) once at import time. It exposes the parsed, immutable data (keys, roles, anonymous role) plus small lookup utilities so that no deployment can invent a permission key at runtime and no request ever re-parses YAML on the hot path.

## Key elements

- **`PERMISSION_ACTIONS` / `PermissionAction`** – Closed set of eight actions (`read`, `create`, `update`, `delete`, `checkout`, `sweep`, `override`, `start`). No wildcard/`manage` exists by design.
- **`scopeOfKey(key)`** – Returns `'platform'` or `'tenant'` purely from the `platform.` prefix on the key string.
- **`PermissionKey`** (interface) – One declared key: `key`, `module`, `subject`, `action`, `scope`, `description`, optional `stepUp` tier, optional ABAC `conditions`, optional `deniedCode`.
- **`PresetRole`** (interface) – A named role with `scope`, `title`, `description`, and a fixed `permissions` list.
- **`keysDocumentSchema` / `rolesDocumentSchema`** – Exported Zod schemas for the full YAML documents; used by `readShared` and by unit tests that assert on malformed fixtures without touching the filesystem.
- **`readShared(file, schema)`** – Reads a file under `shared/`, parses YAML, validates against the schema; throws a descriptive error at boot on any shape mismatch.
- **`PERMISSION_KEYS`** – The validated `PermissionKey[]` from the keys YAML.
- **`PRESET_ROLES`** – The validated `PresetRole[]` from the roles YAML.
- **`ANONYMOUS_ROLE`** – The unauthenticated role (a `RoleLookup` value, not `null`).
- **`PERMISSION_SUBJECTS`** – Deduplicated, sorted list of all CASL subject types named by declared keys; published for client-side typing.
- **`permissionModelVersion(keys)`** – SHA-256 over sorted key names, truncated to a 32-bit unsigned int; used as a cache-busting token on `GET /account/abilities`.
- **`findRole(name)`** – O(1) lookup by role name; returns `undefined` on miss (callers decide the error message).
- **`permissionsOfRole(name)`** – Returns the key list for a role; throws if the name is not declared.
- **`RoleLookup`** (type) – `Pick<PresetRole, 'name' | 'scope' | 'permissions'>`; the true shared shape since the `anonymous` entry lacks `title`/`description`.

## Relationships

- **`src/kernel/access/tenant.ts`** – Imports `DEPLOYMENT_TENANT_ID`, the sentinel tenant identifier used to distinguish platform-scope callers.
- **`src/kernel/ability.ts`** – Source of the `AuthContext`, `AuthorizationScope`, `Caller`, `CallerContext`, `PlatformCaller`, `TenantCaller` types that this module's interfaces and the authorization middleware consume.
- **`src/modules/access/service.ts`** – Calls `findRole` and throws a scope-aware error on miss (`validateGrant`); a primary consumer of the role lookup surface.
- **`src/kernel/middlewares/authorizations.ts`** – The per-request enforcement layer that resolves a caller's role and checks keys against `PERMISSION_KEYS` / `findRole` / `permissionsOfRole`.
- **`src/modules/account/controllers/get-my-abilities.ts`** – Consumes `PERMISSION_KEYS`, `PERMISSION_SUBJECTS`, and `permissionModelVersion` to build the `GET /account/abilities` response and its cache-busting `version` header.
- **`src/modules/account/roles.ts`** – Seed/management layer that creates roles from `PRESET_ROLES` data.
- **`src/kernel/access/query.ts`** – Spreads a `PermissionKey`'s `conditions` object into repository queries (the ABAC half of the model).
- **`src/modules/api-keys/services/api-keys.ts` / `resolver.ts`** – Resolve caller context and check permission keys when authorizing API-key-scoped requests.
- **`src/modules/inventory/service.ts`** – Checks declared keys (e.g. `checkout`, `sweep`) when performing inventory mutations.
- **`scripts/docs/generate-role-matrix.ts`** – Reads `PRESET_ROLES` and `PERMISSION_KEYS` to render the human-readable role→permission matrix for docs.
- **`scripts/ops/reap-inactive-accounts.ts`** – Requires the appropriate permission key before performing the destructive sweep action.

## Notes

- **Read-once-at-import contract.** The YAML is parsed a single time at module load. A malformed file throws at boot (same stance as `required-config.ts`), never on the first authorization request. Do not add lazy or per-request parsing.
- **Scope is spelling, not a field.** The only way a key is platform- or tenant-scoped is the `platform.` prefix on its name. There is no separate lookup table; `scopeOfKey` is a string check.
- **No wildcard action exists.** `manage` is deliberately excluded from `PERMISSION_ACTIONS`. Any code that expects a catch-all action is a bug.
- **`stepUp` lives on the key, not the route.** The "how recently must the session have been re-proved" tier is a property of the action itself, so a second route reaching the same key inherits the requirement automatically.
- **`deniedCode` is the exception, not the rule.** Most keys return a generic `FORBIDDEN`; a key sets `deniedCode` only when the caller *has* a role but lacks this specific key and the correct next-step is something other than "fix your roles" (e.g. "confirm your email").
- **`permissionModelVersion` is order-insensitive.** Keys are sorted before hashing, so a YAML re-order without additions/removals does not bump the version. It is not collision-proof; it only needs to change-or-not.
- **`findRole` returns `undefined`, it does not throw.** This is intentional: `permissionsOfRole` and `access/service.ts` need different error messages. Do not change it to throw without updating both callers.
- **The two YAML files are the single source of truth** and are shared byte-for-byte with the PHP twin. Adding a key or role means editing the YAML, not this TypeScript file.
