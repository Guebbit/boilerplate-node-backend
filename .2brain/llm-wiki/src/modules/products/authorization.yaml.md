---
source: src/modules/products/authorization.yaml
source_sha256: af69bc26299b67bedf6ec8e58658d57cd0b744f96d5d952b0843bc96d1aa8c45
context_sha256: 620b26c40176794c02becffd4c7f926907bc193c554c1f41ec5f12f810e952e4
generated_at: 2026-11-22T07:07:12.037108+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/authorization.yaml

## Purpose
Declares the authorization rules and rule sets for the `products` module. Each rule is an action on the `Product` subject, and sets bundle those rules into named permission groups (storefront, display, management).

## Key elements
- **`rules`**: five entries, all with `subject: Product`, `module: products`, `scope: tenant`:
  - `read`: storefront view. Has `conditions` `active: true` and `deletedAt: null`, so it covers only active, undeleted products.
  - `display`: reads every product regardless of publish state, so staff can see drafts. No conditions.
  - `create`: adds a product to the catalogue.
  - `update`: changes a product, including price and published state.
  - `delete`: removes a product. Kept separate from `update` because of its larger blast radius.
- **`sets`**: named bundles that reference rules as `action:Subject` strings:
  - `ProductStorefront` → `read:Product`
  - `ProductDisplay` → `display:Product`
  - `ProductManagement` → `create:Product`, `update:Product`, `delete:Product`

## Relationships
- Neighbor `src/modules/products/openapi.yaml` is the API spec for the same module. This file doesn't reference it directly, so the link is only that both describe the products module.

## Notes
- `read` is the only rule with `conditions`. `display` has none, so it sees drafts and removed items.
- The `ProductManagement` description says "bring back" products, but no restore rule or action is defined here. Only `create`, `update` and `delete` are listed.
- All rules are tenant-scoped (`scope: tenant`).
