---
source: src/modules/audit-logs/authorization.yaml
source_sha256: da9bb97871bf508160ce8545153cbe5750687381c287f4ff45576711ca2606c9
context_sha256: a31bc07585d8907b950e3273bdfcf645a3b30c70a6cf3bd32747daf668d151af
generated_at: 2026-11-22T04:26:02.500246+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/authorization.yaml

## Purpose
Declares the authorization rules and permission sets for the `audit-logs` module. It defines a single read-only permission on the audit trail and bundles it into a named set that roles can reference.

## Key elements
- **Rule `read:AuditLog`**: action `read`, subject `AuditLog`, module `audit-logs`, scope `tenant`. Description notes there is no write key, so nothing edits an audit row.
- **Set `AuditDisplay`**: module `audit-logs`, "Read the audit trail." Contains one rule, `read:AuditLog`.

## Relationships
- `src/modules/audit-logs/openapi.yaml` is the module's API spec and sits alongside this file. Nothing in this file's content references it directly, so the link is only the shared module.

## Notes
- The module is read-only by design: no create, update or delete rules exist for `AuditLog`.
- The rule is tenant-scoped (`scope: tenant`).
- Rules are referenced inside sets with the `action:Subject` shorthand (e.g. `read:AuditLog`).
