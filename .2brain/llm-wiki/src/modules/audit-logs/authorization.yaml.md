---
source: src/modules/audit-logs/authorization.yaml
sha256: da9bb97871bf508160ce8545153cbe5750687381c287f4ff45576711ca2606c9
generated_at: 2026-11-08T05:07:17.827279+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/authorization.yaml

## Purpose

Declares the authorization rules for the `audit-logs` module. It restricts access to a single read-only permission on the `AuditLog` resource, enforcing that audit rows can be inspected but never modified.

## Key elements

- **`rules`** – A single rule granting `read` on `AuditLog` within the `audit-logs` module at `tenant` scope. Explicitly notes there is no corresponding write key.
- **`sets.AuditDisplay`** – A named permission set that re-exposes `read:AuditLog` as a coarse-grained grant ("Read the audit trail"). Intended for role/permission assignment rather than per-action checks.

## Relationships

- **`src/modules/audit-logs/module.ts`** – The module entry point this file authorizes; the rules and sets here gate access to that module's endpoints.
- **`src/modules/audit-logs/openapi.yaml`** – The OpenAPI contract for the module's endpoints; the `read` rule here is the authorization backing the read operations defined there.

## Notes

- By design there is **no write, create, or delete rule** — audit log immutability is enforced at the authorization layer, not just the service layer.
- Scope is `tenant`, meaning cross-tenant access is not granted by this file.
- The `AuditDisplay` set is a thin wrapper (one rule); it exists for convenience when assigning permissions to roles rather than referencing `read:AuditLog` inline.
