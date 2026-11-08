---
source: src/modules/products/authorization.yaml
sha256: af69bc26299b67bedf6ec8e58658d57cd0b744f96d5d952b0843bc96d1aa8c45
generated_at: 2026-11-08T07:41:41.159426+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/authorization.yaml

## Purpose

Defines the authorization rules and named rule-sets for the **Product** subject in the `products` module. It is the declarative policy layer that determines which tenant-scoped actions (read, display, create, update, delete) are permitted, separating the public storefront view from internal staff views.

## Key elements

- **`rules`** — Five individual rule entries, all scoped to `tenant`:
  - `read:Product` — Active, undeleted products only (storefront view). Carries explicit conditions `active: true` and `deletedAt: null`.
  - `display:Product` — All products regardless of publish state (staff/draft view).
  - `create:Product` — Add a product to the catalogue.
  - `update:Product` — Modify a product, including price and published state.
  - `delete:Product` — Remove a product; deliberately separated from `update` because of its larger blast radius.
- **`sets`** — Three named groupings that bundle rules for convenient reference:
  - `ProductStorefront` — contains `read:Product`.
  - `ProductDisplay` — contains `display:Product`.
  - `ProductManagement` — contains `create:Product`, `update:Product`, `delete:Product`.

## Relationships

- **`src/modules/products/openapi.yaml`** — The OpenAPI contract defines the product endpoints; these authorization rules are the policy that gates which of those endpoints a given caller may invoke and under what conditions.
- **`src/modules/products/openapi.browser-events.yaml`** — Browser-event definitions for product state changes (e.g. publish/unpublish); the `update` and `delete` rules here are the authorization prerequisites for the state transitions those events represent.

## Notes

- The `read` rule is the only one carrying explicit **conditions** (`active: true`, `deletedAt: null`). Every other rule is unconditionally granted at the tenant scope. This asymmetry is intentional: `display` is the broader staff-facing counterpart and must see drafts.
- `delete` is its own rule rather than a value of `update` so that permissioning can grant edit rights without granting removal rights.
- The `sets` are purely organizational sugar — they do not add new permission logic, they just group rules under a human-readable name for use in role/permission assignments.
