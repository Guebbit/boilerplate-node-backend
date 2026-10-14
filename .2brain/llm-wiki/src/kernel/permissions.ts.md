---
source: src/kernel/permissions.ts
sha256: 42961e9824d4140df2ea0b42ad4a091501fa1c20744882210c965846eb9ba138
generated_at: 2026-10-14T08:23:59.636681+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/permissions.ts

## Purpose

Declares the static set of permission keys and preset roles that the Node.js service enforces. Both are loaded from two shared YAML artefacts (`shared/authorization-keys.yaml` and `shared/authorization-roles.yaml`) that the PHP twin reads byte-for-byte identically. The file parses and validates those files once at import (boot), not per request, so that a malformed file fails immediately rather than on the first authorization check.

## Key elements

- **`scopeOfKey(key)`** — Derives `'platform'` or `'tenant'` from a key's spelling (presence of the `platform.` prefix). No lookup table needed.
- **`PermissionKey`** (interface) — Shape of one declared key: `key`, `module`, `subject`, `action`, `scope`, `description`, optional `stepUp` tier, `conditions` (ABAC filter fragment), `deniedCode` (error code for a specific refusal), and `shopperOnly` flag.
- **`PresetRole`** (interface) — Shape of one preset role: `name`, `scope`, `title`, `description`, `permissions[]`, `level` (`admin`/`staff`/`user`), optional `signupDefault` and `promotesTo`.
- **`PERMISSION_KEYS`** — The validated array of all declared keys, in the order listed in the shared YAML.
- **`PRESET_ROLES`** — The validated array of all preset roles.
- **`PERMISSION_SUBJECTS`** — Deduplicated, sorted list of CASL subject types named by the keys; published on `GET /account/abilities` so clients can type their `meta.can` rules.
- **`permissionModelVersion(keys)`** — Returns a 32-bit integer (first 4 bytes of a SHA-256 over the sorted key names) used as a cache-bust `version` on `GET /account/abilities`. Changes when the *set* of keys changes, not when they are merely reordered.
- **`keysDocumentSchema` / `rolesDocumentSchema`** (exported Zod schemas) — Full document-level validators; exported so unit tests can assert on malformed fixtures without hitting the filesystem.
- **`readShared<T>(file, schema)`** (private) — Reads a file under `shared/`, parses YAML, validates against the given Zod schema, and throws a descriptive error on mismatch.
- **`PLATFORM_PREFIX`** — The string `'platform.'`; the sole discriminator between platform-scope and tenant-scope keys.
- **`StepUpTier`** — Union type `'critical' | 'sensitive'` for the step-up authentication requirement attached to a key.

## Relationships

- **`src/kernel/access/tenant.ts`** — Provides `DEPLOYMENT_TENANT_ID`, imported here for tenant-scope resolution.
- **`src/kernel/ability.ts`** — Consumes `PERMISSION_KEYS` and `PRESET_ROLES` to build the CASL ability that is evaluated per-request.
- **`src/kernel/access/query.ts`** — Uses the `conditions` field on `PermissionKey` when translating a key check into a data-filter query.
- **`src/kernel/middlewares/authorizations.ts`** — Middleware layer that calls into the ability/permission machinery defined here.
- **`src/modules/account/controllers/get-my-abilities.ts`** — Exposes `PERMISSION_KEYS`, `PERMISSION_SUBJECTS`, and `permissionModelVersion` to the client.
- **`src/modules/account/roles.ts`** — Role assignment logic built on top of `PRESET_ROLES` (e.g. `signupDefault`, `promotesTo`).
- **`src/modules/access/service.ts`** — Access-control service that references declared keys and roles.
- **`src/modules/api-keys/services/api-keys.ts`** — API-key service that scopes keys against `PERMISSION_KEYS`.
- **`scripts/docs/generate-role-matrix.ts`** — Reads `PRESET_ROLES` and `PERMISSION_KEYS` to generate the documentation role-matrix.
- **`scripts/ops/reap-inactive-accounts.ts`** — Ops script that relies on the declared role/key data for account cleanup decisions.
- **`src/modules/access/tests/*`** and **`src/modules/account/tests/*`** — Integration and unit tests that exercise the declared keys, roles, and ability construction.

## Notes

- **Boot-time parse, not request-time.** The YAML is read once at import. A malformed file throws at process start, not on the first authorization call. This mirrors the stance in `src/kernel/config.ts`.
- **Roles are data, permissions are code.** The set of keys and their mapping to roles is fixed by the two shared YAML files. A deployment cannot invent a new key; `assertDeclared` (referenced in the docblock, likely in a sibling module) enforces this at runtime.
- **Scope is derived from spelling.** There is no separate scope lookup; the `platform.` prefix is the sole signal. This guarantees a bare key can never be satisfied by a platform caller and vice-versa.
- **`deniedCode` is deliberately typed as `string`, not the generated error-code enum.** This avoids a circular import: the error-code catalogue (`@api/error-codes`) is produced *after* this module is loaded (during `contracts:bundle`), so a typed reference would break boot ordering. Cross-checking is done in `tests/cross-cutting/authorization-keys.test.ts`.
- **`shopperOnly` flag.** Keys marked this way are held only by shopper roles and are excluded from the "holds every declared key" completeness check, so `admin` (which does not shop) remains unrestricted.
- **No wildcard `manage` action exists.** The action vocabulary is a closed set generated from `shared/authorization-keys.yaml`; there is deliberately no catch-all.
