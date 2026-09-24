---
source: src/modules/delivery/domain/index.ts
sha256: b686e57822c9ce47c21e31d8af1fa85d863fc23ae20141a8b57781b3a1b9f6cc
generated_at: 2026-09-23T18:35:49.842913+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/index.ts

## Purpose

Barrel file that exposes the delivery domain rules (shipping rates and pricing logic) as a clean import surface. It lets consumers pull in pure domain functions without importing the module's HTTP/service layer, per the domain-layer convention documented in `docs/theory/domain-layer.md`.

## Key elements

- **`SHIPPING_METHODS`** — re-exported constant (the catalogue of available shipping methods, defined in `rates.ts`).
- **`findShippingMethod`** — re-exported lookup helper.
- **`priceShipping`** — re-exported pricing function.
- **`methodFitsWeight`** — re-exported guard that checks whether a method accepts a given weight.
- **`methodsForWeight`** — re-exported filter that returns all methods valid for a weight.

## Relationships

- **`src/modules/delivery/domain/rates.ts`** — the sole source; every export here is a re-export from that file.
- **`src/modules/delivery/index.ts`** — the module-level barrel; expected to re-export (or compose with) this domain surface for consumers of the whole delivery module.
- **`src/modules/delivery/service.ts`** — the service layer that consumes these domain rules to handle delivery operations.
- **`src/modules/delivery/tests/integration/service.test.ts`** — integration tests that exercise the service, which in turn relies on the re-exported domain functions.

## Notes

- This file contains **no logic** — it is purely a re-export. All implementation lives in `rates.ts`.
- The `@module` doc comment signals the intended import path: consumers should `import { … } from '…/delivery/domain'` rather than reaching into `rates.ts` directly, keeping the domain boundary explicit.
