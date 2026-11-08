---
source: src/modules/access/authorization.yaml
sha256: 699ed11bb25fbb5bf9849d7d32a68bf97177077823f888b98572cf73ba6961b4
generated_at: 2026-11-08T03:56:10.577420+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/authorization.yaml

## Purpose

Defines the authorization rules and permission sets that govern who may manage staff **roles** within a tenant. It exists to separate role administration (a privileged, administrator-only action) from the broader customer-facing user management that other `users` rules permit.

## Key elements

- **`rules`** — A single rule:
  - `assign` on subject `Role` (module `access`, scope `tenant`, `credential: false`). Grants the holder the ability to assign or revoke a staff role on an account, and to edit, ban, or erase an account that already holds a role.
- **`sets`** — One permission set:
  - **`RoleManagement`** (module `access`) — bundles the `assign:Role` rule. This is the unit that gets referenced by upstream role/permission assignments.

## Relationships

- **`src/modules/access/module.ts`** — The owning module file. It loads this YAML to register the `RoleManagement` permission set and the `assign:Role` rule into the access module's authorization registry.
- **`src/modules/access/openapi.yaml`** — The OpenAPI spec for the access module. Endpoints for role assignment/removal are gated by the `assign:Role` rule defined here.
- **`src/modules/account/module.ts`** — The account module exposes the edit/ban/erase operations on role-bearing accounts. This file's rule is the authorization gate that restricts those operations to holders of `RoleManagement`.
- **`shared/scenarios/personas.yaml`** — Defines test personas (e.g., administrator, moderator) whose granted permission sets are validated against the rules and sets declared here.

## Notes

- `credential: false` means the action does **not** require a credential (e.g., a one-time code or confirmation token); a normal authenticated request suffices.
- The file intentionally does **not** define a hierarchy or "level" between roles. A role is described purely as a bundle of permission sets; any ranking is an application-level concern, not an authorization concern.
- The `scope: tenant` restriction ensures the rule applies only within a single tenant boundary — cross-tenant role assignment is out of scope for this file.
