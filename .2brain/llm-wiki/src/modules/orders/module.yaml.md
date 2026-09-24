---
source: src/modules/orders/module.yaml
sha256: 3cb69e887d72dcb3d895e536aaa4b80a2a09a7fddf5d181ce508a6afcc3efafb
generated_at: 2026-09-23T19:04:28.918504+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/module.yaml

## Purpose

Declarative module manifest for the **orders** module. It tells the runtime which subdomain the module belongs to and lists the other modules it depends on at the data/transaction level, along with a one-line note explaining _why_ each dependency exists.

## Key elements

- **`subdomain: core`** — Places the orders module in the `core` subdomain (as opposed to, e.g., an edge or auxiliary subdomain).
- **`dependsOn`** — Ordered list of module dependencies:
    - **`inventory`** — Orders place a claim on stock units; the claim is released on cancellation or when the reservation expires (`RESERVATION_EXPIRED`).
    - **`products`** — Each order line copies the relevant catalogue-row fields at purchase time (snapshot, not a live reference).
    - **`users`** — A `USER_DELETED` cascade affects orders; the buyer's stored locale is used for outbound emails.

## Relationships

- **`src/modules/orders/module.ts`** — The TypeScript entry point / implementation for this module; the YAML manifest is its declarative counterpart (subdomain, dependency list).
- **`src/modules/orders/openapi.yaml`** — OpenAPI specification for the orders REST surface; together with this manifest it fully describes the module's public contract.
- **`src/modules/payments/module.ts`** — Neighboring module in the dependency graph; no direct reference in this file's content.

## Notes

- The dependency list is **ordered**; the inline comments are the authoritative "why" for each edge and are the primary reason this file exists as human-readable YAML rather than being buried in code.
- The `products` dependency is a **point-in-time snapshot** (fields copied at purchase), not a live foreign-key relationship—important when interpreting schema migrations.
