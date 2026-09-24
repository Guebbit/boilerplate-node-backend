---
source: src/modules/cart/probes.ts
sha256: b8e53364f9379e51a544d671850ceed6f45d00a86f15ce74342274200490357b
generated_at: 2026-09-23T18:31:25.295189+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/probes.ts

## Purpose

Declares the cart module's list of "probes" — concrete API requests that the OpenAPI contract can describe but cannot express on its own (e.g., a 404-earning body, a forbidden zero quantity, a catalogue-gate bypass). These probes are consumed by the runnable-collections pipeline to exercise edge cases the spec alone cannot capture.

## Key elements

- **`probes: Probe[]`** — the single export; an array of four `Probe` objects (type imported from `@guebbit/openapi-runnable-collections`). Each entry carries `name`, `why`, `method`, `path`, `auth`, and optionally `body`.
  1. *Checkout with an empty cart* — `POST /cart/checkout`; exercises the `checkout_failed` event path.
  2. *Add a non-existent product* — `POST /cart` with a fabricated `productId`; expects a 404.
  3. *Set quantity on an inactive product* — `PUT /cart/{{seedInactiveProductId}}`; verifies the catalogue gate shared with `POST /cart`.
  4. *Zero quantity* — `POST /cart` with `quantity: 0`; exercises the minimum-quantity validation.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — owns the surrounding pipeline: the definition of what a probe is for, where the probe array is emitted into the bundle, and the registry of valid `{{seedToken}}` placeholders (e.g. `{{seedProductId}}`, `{{seedInactiveProductId}}`) that probes may reference. This file only supplies the cart-specific entries.

## Notes

- The `why` strings are prose, not comments — they are rendered into the generated collection for the human reading the request list. Keep them descriptive but concise.
- Seed tokens (`{{…}}`) are resolved at bundle-emission time by the contracts script; do not hard-code product IDs where a token is available.
- Probes use `auth: 'bearer'` uniformly; there is no unauthenticated case in this file.
