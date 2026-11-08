---
source: src/modules/shop/module.ts
sha256: 19f0592d96b223ee81dc8e7f07334a4ff9edb675d296a6852d6d3138c7809501
generated_at: 2026-11-08T08:20:32.765242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/module.ts

## Purpose

Declares the shop module's manifest — the single object the kernel registry consumes to know what to mount, which config slice to validate at boot, and that the module carries no personal data. It exists so the rest of the codebase never needs to reference the shop's internals directly; this file is the public contract.

## Key elements

- **`export default { … } satisfies AppModule`** – The manifest. Fields:
  - `name: 'shop'` – Module identifier used in logs, routing, and registry lookups.
  - `mounts` – Binds `router` (from `./routes`) under the `/shop` base path.
  - `config` – Exposes `shopConfig.slice` as this module's boot-gate slice (time zone and operator phone are required here, whereas the `account` module leaves phone optional).
  - `personalData: 'none'` – Signals that the module persists no user PII.

## Relationships

- **`src/kernel/registry.ts`** – Supplies the `AppModule` type that this file's export satisfies; the registry collects this manifest at boot.
- **`src/modules/shop/routes.ts`** – Source of the `router` passed into `mounts`.
- **`src/modules/shop/config.ts`** – Source of `shopConfig`, whose `slice` is declared as the module's config gate.
- **`src/modules.ts`** – Aggregates this default export alongside other module manifests.

## Notes

- The required-vs-optional distinction for the operator phone (required here, optional in `account`) is intentional and load-bearing for the withdrawal-notice flow; don't relax the shop slice without checking that path.
- `openapi.yaml` and `config.test.ts` are not imported here; they are related artifacts but have no runtime dependency on this file.
