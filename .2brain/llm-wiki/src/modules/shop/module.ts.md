---
source: src/modules/shop/module.ts
sha256: bffc123c160f4fca38ea9bd38c492ef761aaad5744c28a11436e598de8ff25c8
generated_at: 2026-10-29T05:52:00.949686+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/module.ts

## Purpose

Declares the shop module's manifest: a single routing mount, one config-slice boot gate, and no data persistence. It is the registration point that tells the kernel *what* the shop module exposes and *how* to wire it in.

## Key elements

- **`default` export** — An object satisfying `AppModule` that bundles the module's name (`'shop'`), its mount, its config gate, and its personal-data posture.
- **`mounts`** — Mounts the imported `router` (from `./routes`) under the base path `/shop`.
- **`config`** — Registers `shopConfig.slice` (from `./config`) as the module's boot-time config gate; the slice enforces required identity fields (name, address, email, phone, country, time zone).
- **`personalData: 'none'`** — Signals to the kernel that this module performs no persistence; all state is deployer-supplied configuration.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `AppModule` type that the default export `satisfies`; defines the shape every module manifest must conform to.
- **`src/modules.ts`** — Top-level aggregator that collects this module (alongside others) to form the application's module list.
- **`src/modules/shop/routes.ts`** — Exports the `router` that gets mounted at `/shop`.
- **`src/modules/shop/config.ts`** — Exports `shopConfig.slice`, the zod (or similar) schema validated at boot.
- **`src/modules/shop/tests/unit/config.test.ts`** — Unit-tests the config slice referenced here; failures here block boot.

## Notes

- The `satisfies AppModule` annotation is a type-check only — it does not alter the runtime value. If you add a field not in `AppModule`, the compiler will flag it.
- The comment "No collection" is a deliberate declaration, not an omission: the kernel skips any data-layer wiring for this module because of `personalData: 'none'`.
- The config gate is a *slice*, not the full `shopConfig` object. Only the slice is validated at boot; the rest of `shopConfig` is available to routes at runtime.
