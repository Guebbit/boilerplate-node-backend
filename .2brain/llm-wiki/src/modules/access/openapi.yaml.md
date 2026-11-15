---
source: src/modules/access/openapi.yaml
sha256: 7b2a54a0cd8651240085d855bf1af3b1d8d6e87951373c9cf8992e03b9b7b2f4
generated_at: 2026-11-14T18:26:29.183563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the `access` module. It defines no HTTP routes of its own (`paths: {}`); it exists purely as a shared schema reference so that the `account` module can type the authorization payload it returns on `GET /account`, sign-in, and refresh responses. It also declares the module's `x-personal-data` section (the role list in account data exports).

## Key elements

- **`x-personal-data.roles`** — schema for the `roles` array in account data. Each entry is `{ role, scope }` where `scope` is `tenant` or `platform`. Role lives in a membership row, not on the user document.
- **`components.schemas.Abilities`** — the full authorization payload a client receives. Required fields: `tenant`, `platform`, `version`, `grantableRoles`, `secondFactorRequired`.
  - `tenant` / `platform`: each a `PackedRules` array (CASL packed rules) for that scope. They are **never merged**; a tenant rule cannot satisfy a platform key or vice-versa.
  - `version`: integer (min 1), bumped when the permission *model* changes (i.e. the rules file), not when a role changes. Clients use it to invalidate cached rules.
  - `grantableRoles`: array of role names this caller may assign via `POST`/`PUT`/`PATCH /users`. Computed from the same rules as the server-side `403`/`422` checks. No authority — re-checked server-side.
  - `secondFactorRequired`: `true` when a staff caller has no authenticator armed; their rules are the customer's, not the staff's.
  - `tenantId`: the shop the `tenant` rules apply to; absent for pure platform operators.
- **`components.schemas.PackedRules`** — CASL packed-rule array format: `[action, subject, conditions|0, inverted(1|0), fields, reason]` with trailing-absent omission. Modeled as a recursive `oneOf` of string / integer(0|1) / object per position (OpenAPI has no tuple type).

## Relationships

- **`src/modules/access/authorization.yaml`** — the authorization rules and keys this contract types. The `version` field in `Abilities` is bumped when that file's model changes, and `grantableRoles` ordering follows the role declaration order defined there. The invariant that tenant rules never satisfy platform keys (and vice-versa) is established in that file.
- **`src/modules/access/module.ts`** — the runtime module that computes and serializes the `Abilities` object returned by `account`'s endpoints. This YAML is the type contract that module must satisfy; it does not import the YAML at runtime.

## Notes

- This module has **zero routes**. The `paths: {}` block is intentional and should not be filled in.
- The `Abilities` payload published to clients is **advisory only** (rendering hints / grey-out). Every real authorization decision is re-evaluated server-side. Do not treat the client copy as a source of truth.
- `version` tracks the *model* (the rules file), not a specific role. A role change alone does not bump it; a structural change to how rules are shaped does.
- The single-tenant assumption is baked into the contract: `scope` is `tenant | platform`, and there is no multi-shop dimension. Adding one would change this schema.
