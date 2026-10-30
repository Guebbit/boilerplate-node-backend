---
source: scenarios/collection-values.ts
sha256: 22ccfa8e45dd7594b7e8194be4f1006140d6ee2dc2ede86234ffe53581ecf55c
generated_at: 2026-10-29T01:21:39.391828+00:00
model: ollama:qwen3.8:27b
---

# scenarios/collection-values.ts

## Purpose

Defines the `CollectionValues` interface — the single contract that each module's `scenarios/values/<module>.ts` file implements when contributing example values to the generated API client. The bundler (`scripts/contracts/client-collections-bundle.ts`) scans those per-module value files and merges whatever they export as `collectionValues`, so no central registry names individual modules.

## Key elements

- **`CollectionValues`** (interface, the sole export) — describes what a single module can contribute:
  - `byProperty?` — a flat record of *property name → scalar value* (`string | number | boolean`) to inject wherever a generated body or query carries that property.
  - `tokens?` — a record of `{{token}}` names and their resolved string values, available to probes.
  - `pathParam?` — a callback `(name, template) => string | undefined` that supplies a value for a path parameter when the module has an opinion; returns `undefined` to defer.

## Relationships

- **`scenarios/values/cart.ts`**, **`scenarios/values/orders.ts`**, **`scenarios/values/products.ts`** — per-module value files that import `CollectionValues` and export their own `collectionValues` object typed to it. Each lives beside its module's other fixtures.
- **`scripts/contracts/client-collections-bundle.ts`** — the bundler that scans `scenarios/values/*.ts`, collects each file's `collectionValues` export, and merges them into the client's example-value bundle.

## Notes

- Two of the three fields are plain data records; `pathParam` is the only callable. Code consuming `CollectionValues` must branch on whether it's present and invoke it with the parameter name *and* the route template.
- The design is deliberately decentralized: adding a new module's values requires no change to this file or the bundler — only a new `scenarios/values/<module>.ts` that exports a `collectionValues` conforming to the interface.
