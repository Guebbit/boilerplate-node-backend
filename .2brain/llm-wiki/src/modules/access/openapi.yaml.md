---
source: src/modules/access/openapi.yaml
sha256: 8f1163d60e99dd4167926caaa744302d4cd4fe040b6ee7890b283ae23c80292f
generated_at: 2026-11-08T03:56:49.371040+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/openapi.yaml

## Purpose

OpenAPI 3.1.0 component-only contract for the `access` module. It declares no routes (`paths: {}`); instead it defines the schemas that `account` embeds in its `GET /account`, sign-in, and refresh responses. It exists so clients and server share one normative description of the ability/role payloads without re-deriving them from TypeScript.

## Key elements

- **`x-personal-data.roles`** — Schema for the `roles` array surfaced in account data. Each entry is `{ role: string, scope: "tenant" | "platform" }` drawn from membership rows, not the user document.
- **`components.schemas.Abilities`** — The primary payload a client receives. Contains:
  - `tenant` / `platform` — Two independent `PackedRules` lists (never merged); a client builds one ability per scope and queries only the one that owns the subject key.
  - `version` — Integer bumped when the rules *model* changes; tells a caching client its cached rules describe a different model.
  - `grantableRoles` — Ordered list of tenant-scope roles the caller may assign via `POST/PUT/PATCH /users`; empty when the caller cannot grant. Advisory only; the write is re-checked server-side.
  - `secondFactorRequired` — `true` when the caller holds an un-enrolled staff role; rules then reflect the customer account, and a client should show an enrol prompt.
  - `tenantId` — Identifier of the shop whose rules `tenant` describes; absent for pure platform operators.
- **`components.schemas.PackedRules`** — Array of CASL packed-rule tuples `[action, subject, conditions?, inverted?, fields?, reason?]`. Because OpenAPI has no tuple type, each position is declared as `oneOf: string | integer(0|1) | object`.

## Relationships

- **`src/modules/access/authorization.yaml`** — Declares the role definitions and the tenant/platform key invariant. `Abilities.grantableRoles` is "in the order `shared/authorization-roles.yaml` declares them," and the two-scope split mirrors that file's one invariant that a tenant rule can never satisfy a platform key.
- **`src/modules/access/module.ts`** — The runtime module that serves the `Abilities` payload described here on the `account` endpoints and that computes `grantableRoles` with the same logic that produces `403`/`422` on user writes.

## Notes

- The `Abilities` payload is explicitly **advisory for clients**: it governs what to render (grey-out), never what is allowed. Every request is re-evaluated server-side. The spec calls this out repeatedly because the failure mode is a silent 403 on a button the client thought was enabled.
- `PackedRules` uses `0` as a positional placeholder for absent `conditions` or `inverted: false` when a later tuple member is present — a CASL convention, not an OpenAPI one.
- The spec is versioned independently (`version` inside `Abilities`) from the OpenAPI doc version; bumping one does not imply the other changed.
