---
source: src/modules/cart/probes.ts
sha256: cd70fec93809790c0a9c3a21c3c77bc29397ddba5e1a74b7b09693f11d6d7df6
generated_at: 2026-11-08T05:15:31.425494+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/probes.ts

## Purpose

Exports the cart module's probe collection: a set of `Probe` request definitions that exercise failure and boundary paths the OpenAPI contract can describe but cannot trigger. Each probe encodes *why* it exists in a `why` string so the intent is self-documenting.

## Key elements

- **`probes: Probe[]`** (exported const) — the four probe entries:
  - *Checkout with empty cart* — `POST /cart/checkout`; the only clean way to observe the `checkout_failed` event.
  - *Add a nonexistent product* — `POST /cart/items` with a zero-UUID; guards against the cart silently storing a dangling reference.
  - *Quantity on a hidden product* — `PATCH /cart/items/{{seedInactiveProductId}}`; proves the shared service-level catalogue gate applies to the patch route too.
  - *Zero quantity* — `POST /cart/items` with `quantity: 0`; confirms the schema's `min: 1` is enforced rather than treated as a remove shortcut.

## Relationships

- **Type import:** `Probe` from `@guebbit/openapi-runnable-collections` — shapes the array elements.
- **Doc-comment reference:** `scripts/contracts/client-collections-bundle.ts` owns the surrounding probe framework (emission target, seed-token vocabulary). This file is a leaf that the bundle consumes.

## Notes

- `{{seedToken}}` placeholders (e.g. `{{seedProductId}}`, `{{seedInactiveProductId}}`) are resolved at bundle time by the script above; they are **not** literal path segments or values at runtime.
- All probes use `auth: 'bearer'`; the seeded non-admin user is assumed to start with an empty cart, which is what makes the first probe's pre-state reachable without setup steps.
- The file is intentionally side-effect-free: it exports a frozen data structure and imports only a type.
