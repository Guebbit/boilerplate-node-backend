---
source: src/modules/products/module.yaml
sha256: aa422e0cdaf90111085d662013138f6c3946d692c95d26d6dae878d5dcd53839
generated_at: 2026-11-08T07:45:21.585885+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/module.yaml

## Purpose

Module declaration for the **products** module. It defines the module's identity (summary, subdomain, group) and its dependency on the `shop` module, establishing that products lives in the core subdomain of the shop group and that all pricing is quoted in the currency provided by `shop`.

## Key elements

- **`summary`** – Human-readable one-liner: *"The catalogue, its search surface and its cache."*
- **`subdomain: core`** – Places this module in the `core` subdomain (as opposed to, e.g., a feature or integration layer).
- **`group: shop`** – Assigns the module to the `shop` group for organisational/namespace purposes.
- **`dependsOn: [shop]`** – Declares a hard dependency on the `shop` module, annotated as *"the currency every price is quoted in."*

## Relationships

- **`shop` module (dependency)** – Products relies on `shop` for its currency model; every price the products module exposes is denominated in that currency.
- **`src/modules/delivery/module.yaml` (graph neighbor)** – Appears as an adjacent node in the dependency graph, indicating the delivery module references or is referenced by products (e.g., fulfilment of a purchased item), though no explicit field in this file names it.

## Notes

- The `dependsOn` entry references the module by its short name (`shop`), not by file path. Resolution is presumably handled by the module registry or build tool.
- The summary mentions a *cache* and a *search surface*; the actual implementation of those lives in other files under this module, not in this YAML.
