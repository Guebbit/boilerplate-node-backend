---
source: src/modules/products/tests/unit/schema-contract.test.ts
sha256: 3e59406cae154dbefb22cd8853793d2fad92a314ec1a15d629d753bdbf5acc06
generated_at: 2026-10-29T05:35:10.641323+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/schema-contract.test.ts

## Purpose

Verifies the product schema's field contract (required fields, defaults, constraints, indexes) and the derived `available` value computed by `applyProductTransform`. Each assertion encodes a business decision—why a default is what it is, why a field is absent rather than empty—so that schema changes are caught against the intended semantics, not just type-shape.

## Key elements

- **`serialize(onHand, reserved)`** — local helper that builds a minimal product document and returns only the `.available` value produced by `applyProductTransform`. Used to test availability arithmetic in isolation.
- **`describe('productSchema — what a product must carry')`** — asserts required paths (`title`, `price`), min-0 constraints on `onHand`/`reserved`, and the exact default (or absence) of `active`, `requiresShipping`, `description`, `categories`, `tags`, `imageUrl`, `deletedAt`, and `timestamps`.
- **`describe('productSchema — indexes')`** — asserts the three named compound indexes (`products_active_deletedAt`, `products_createdAt`, `products_sku`) and that `products_sku` is both `sparse` and `unique`.
- **`describe('applyProductTransform — the derived availability')`** — asserts `available = max(0, onHand - reserved)`, clamping at 0, treating missing counters as 0 (no `NaN`), and treating non-numeric counters as 0 (no coercion).

## Relationships

- **`src/modules/products/model.ts`** — source of `productSchema` (the Mongoose schema under test) and `applyProductTransform` (the transform whose output this file pins down).
- **`tests/support/schema.ts`** — provides the generic schema-introspection helpers (`requiredPaths`, `defaultOf`, `pathOptions`, `optionsOf`, `indexSpecs`, `indexOptionSpecs`) used to inspect the schema declaratively rather than re-implementing introspection per test.

## Notes

- Comments in the tests are the primary documentation of *why* a default or constraint exists (e.g., `requiresShipping: true` matches `openapi.yaml`; `deletedAt` must stay undefined so a default wouldn't soft-delete every product). Treat them as part of the spec.
- The `serialize` helper intentionally passes `undefined` and non-number values to `applyProductTransform`; the tests assert the transform fails closed (treats as 0) rather than propagating `NaN` or coercing strings.
- `products_sku` is `sparse` + `unique`: most products have no SKU, and a non-sparse unique index would collide on the implicit `null`. The comment cross-references the same pattern on `orders_transferReference`.
