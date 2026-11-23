---
source: src/modules/access/openapi.yaml
source_sha256: 7b2a54a0cd8651240085d855bf1af3b1d8d6e87951373c9cf8992e03b9b7b2f4
context_sha256: c71f4c0d76ef6c1cb5e738a430dd3b1b6bec5258f04f670d3abf6a78aa9dd6ff
generated_at: 2026-11-22T03:16:47.447960+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract for the `access` module (version `0.1.0`). It declares no HTTP routes (`paths: {}`); it only supplies shared schemas and a personal-data declaration. The `account` module exposes these on its own endpoints, so a client can grey out UI from the same authorization rules the server enforces.

## Key elements
- **`x-personal-data.roles`**: Declares the role list as this module's section of the account data export. It is an array of `{role: string, scope: tenant|platform}` objects with `additionalProperties: false`. Only scope is exposed, never the tenant id. The reason given is that the deployment ships a single shop, so the id would mean nothing to a subject.
- **`components.schemas.Abilities`**: What the caller may do, in CASL packed-rule format (the shape `unpackRules` takes). Required fields:
  - `tenant` and `platform`: two separate `PackedRules` lists, one per scope. They never merge, so a client builds one ability per scope.
  - `version`: integer ≥ 1. It is the permission model's version and changes when the rules change, not when a role does. It tells a client its cache is stale.
  - `grantableRoles`: the tenant-scope roles the caller may assign through the `/users` writes. They come in the order declared in `shared/rules/authorization-roles.yaml`. The list is computed by the same rule as the write's `403`/`422`, and is empty if the caller can grant nothing.
  - `secondFactorRequired`: `true` when the caller holds a staff role that grants nothing yet because no authenticator app is armed. The client then shows an enrol prompt rather than a staff menu.
  - `tenantId` (optional): the shop that `tenant` refers to. It is absent for a pure platform operator with no tenant membership.
- **`components.schemas.PackedRules`**: An array of packed rules, each `[action, subject, conditions|0, inverted 1|0, fields, reason]` with trailing absent members omitted. OpenAPI has no tuple type, so each item is an array whose elements are `oneOf` string, integer (`0` or `1`), or object.

## Relationships
- **`src/modules/account/openapi.yaml`**: The file's header comment says `account` carries these rules on `GET /account`, on the sign-in answers and on the refresh answer. `account` also carries the role list in its data export.
- **`shared/rules/authorization-roles.yaml`**: Defines the order of the roles in `grantableRoles`.

## Notes
- The client copy of the abilities has no authority. It decides what to render, and every request is re-evaluated server-side.
- Both scopes are published because a client renders tenant and platform screens together. Tenant rules alone would leave platform screens with nothing to grey out.
- The `tenant` and `platform` properties use `allOf` with a `$ref` so that a `description` can sit beside the reference.
- Roles are stored in membership rows, not on the user document. For that reason `profile` alone does not show what an account may do.
