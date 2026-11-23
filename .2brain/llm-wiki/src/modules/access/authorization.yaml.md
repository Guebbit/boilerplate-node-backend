---
source: src/modules/access/authorization.yaml
source_sha256: 00541d996fb9875b9c1ee415963434138889e7b688d2ad63c9763de2de641ba4
context_sha256: 917e3987ded8aed12c449b0a40e835992776137bf84205e50fcab5cd230a3835
generated_at: 2026-11-22T03:15:37.996784+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/authorization.yaml

## Purpose
Declares the authorization rule and permission set that guard staff-role management in the `access` module. It defines a single permission, `assign:Role`, which protects *people* rather than customers: whoever holds it may grant or revoke a staff role and may edit, ban or erase an account that already holds one.

## Key elements
- **Rule `assign` on subject `Role`** (module `access`, scope `tenant`, `credential: false`): hands a staff role to an account or takes it away, and changes an account holding one (edit, ban, erase). Described as held by administrators.
  - `stepUp: critical`: requires a fresh login at the same tier as minting an API key.
  - `deniedCode: ROLE_MANAGEMENT_REQUIRED`: callers lacking it get this specific code instead of a bare `FORBIDDEN`.
- **Set `RoleManagement`** (module `access`): bundles the single rule `assign:Role`.

## Relationships
- `src/modules/access/module.ts` is the neighboring module file in the same `access` module. Both declare `module: access`, so this file's rule and set belong to that module. The file content does not show how `module.ts` loads or references it.

## Notes
- Other `users` rules only affect customers. A moderator who may erase accounts therefore cannot erase an administrator's account; only `assign:Role` holders can act on accounts holding a staff role.
- A role is just a bundle of permission sets. There is no level or rank to compare.
- `stepUp: critical` exists because changing someone's powers is the one admin act a stolen session must not be able to do quietly.
