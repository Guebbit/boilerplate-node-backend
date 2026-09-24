---
source: src/modules/products/audit.ts
sha256: 5ffda18c48cf5a146c324d6d65643b3c0659a19d3bae273a3c4f3f86337e8b1f
generated_at: 2026-09-23T19:25:13.361466+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/audit.ts

## Purpose

Defines the audit-action vocabulary owned by the products module (three admin write events) and registers those actions into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that compliance/audit consumers can query product-mutation events by a stable, typed identifier without importing a shared enum.

## Key elements

- **`productsAuditActions`** (const object) — The three action strings this module can emit: `admin.product.created`, `admin.product.updated`, `admin.product.deleted`. Exposed as a read-only `as const` record so consumers get literal types.
- **`declare module '@infrastructure/observability/audit'`** — Augments the shared `AuditActionMap` interface with a `products` key whose type is the union of all values in `productsAuditActions`. This is the mechanism that makes the actions visible to the observability layer without a central registry file.

## Relationships

- **`src/modules/products/service.ts`** and **`src/modules/products/controllers/delete-products.ts`** — The product service/controller layer is the emission source for these actions; they import `productsAuditActions` when recording audit entries for create, update, and delete operations.
- **`src/modules/products/tests/unit/audit.test.ts`** — Unit test covering this file's exports.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — Cross-cutting test that verifies every module (including this one) has correctly registered its actions into `AuditActionMap`.

## Notes

- Only **write** actions are defined. The file's header comment explicitly states that reads are public/unauthenticated, so there is no actor to record and no compliance query would target them. Do not add a read action here.
- The module-augmentation pattern (rather than a shared enum) is deliberate; see `modules/account/audit.ts` for the stated rationale. Follow the same pattern if adding actions.
