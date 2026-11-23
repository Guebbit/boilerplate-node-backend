---
source: src/modules/stats/authorization.yaml
source_sha256: 843e4f447eb67b391fe8d1959d772cecd1c72878f05e1c1b075815292b843dde
context_sha256: 2fdc069e2676b3c232ade7976785dd2b99de77006526d874a3d6bae22961165a
generated_at: 2026-11-22T07:49:58.963389+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/authorization.yaml

## Purpose
Declares the authorization rules and rule sets for the `stats` module. It defines what permission exists for reading shop sales statistics and bundles it into a named set that can be assigned.

## Key elements
- **Rule `read:Stats`** — action `read` on subject `Stats`, module `stats`, scope `tenant`, `credential: false`. Described as reading the shop's sales numbers (revenue, orders, products, customers, payments mix).
- **Set `StatsDisplay`** — module `stats`, containing the single rule `read:Stats`. Described as "Read the shop's sales numbers."

## Relationships
- Sits alongside `src/modules/stats/openapi.yaml` in the same module. The OpenAPI spec describes the stats API surface, while this file defines the permission model for it. The file content itself doesn't reference the OpenAPI file or show how the two are linked.

## Notes
- Rules are referenced inside sets by the `action:Subject` form (e.g. `read:Stats`).
- Scope is `tenant`, so the permission applies at tenant level.
- Only a read permission exists; there are no write or manage rules for stats.
