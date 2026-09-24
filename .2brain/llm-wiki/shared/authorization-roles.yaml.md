---
source: shared/authorization-roles.yaml
sha256: 607b042f3d0467645e1021ddec303d534a6a450cb08bb01f9554e91b96093552
generated_at: 2026-09-23T17:33:21.763878+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-roles.yaml

## Purpose

Declares the complete set of preset authorization roles (and the exact keys each holds) so that the Node and PHP-Laravel boilerplate repos produce the **same product** out of the box, not merely two implementations that happen to pass the same conformance tests. It is the single source of truth both seeders read verbatim; nobody deploys an empty permission matrix.

## Key elements

- **`version`** — schema version (currently `1`).
- **`roles`** — ordered list of role objects, each with `name`, `scope` (`tenant` or `platform`), `title`, `description`, and an explicit `permissions` array.
    - _Tenant roles:_ `unverified`, `customer`, `manager`, `warehouse`, `support`, `editor`, `moderator`, `admin`.
    - _Platform role:_ `operator` — holds only `platform.observability.any.read`; explicitly cannot read shop-level data.
- **`anonymous`** — the role every unauthenticated request resolves to (named `guest`, scope `tenant`); holds only `products.self.read`, `locales.self.read`, `delivery.any.read`.
- **No wildcards anywhere.** Breadth is encoded in the key name (`self` vs `any`), so every role lists exactly the keys it grants, `admin` included.

## Relationships

- **`shared/authorization-keys.yaml`** — defines the full key vocabulary and their semantics. This file references key names as strings; the conformance note in `authorization-keys.yaml` states that a key no role lists grants nothing to anyone (including `admin`).
- **`shared/authorization-conformance.yaml`** — the test suite that both boilerplates run. It cross-checks this file's role grants against the key catalogue: a declared tenant key omitted from `admin`'s list causes a conformance failure, and the suite asserts `operator` holds no shop-level key.

## Notes

- The file is committed byte-for-byte identical in `boilerplate-node-backend` and `boilerplate-php-laravel-backend`; do not fork it per repo.
- Roles are a **starting point, not a schema** — operators may add/remove keys post-deployment.
- Every staff role (including `admin`) holds `cart.self.checkout` explicitly. There is deliberately no "unverified manager": granting a staff role _is_ the vouching act, so the one key an unverified account lacks is the spending key.
- `admin` is scoped to a single tenant; it says nothing about platform scope. One role cannot span both scopes by design.
- The PHP implementation stores these via `spatie/laravel-permission`; the Node implementation does not persist them the same way. This file is what keeps the two stores aligned.
