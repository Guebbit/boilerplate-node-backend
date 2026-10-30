---
source: src/modules/cart/probes.ts
sha256: cd70fec93809790c0a9c3a21c3c77bc29397ddba5e1a74b7b09693f11d6d7df6
generated_at: 2026-10-29T03:22:51.515032+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/probes.ts

## Purpose

Declares hand-written API test probes for the cart module — specific requests that exercise failure paths and boundary conditions the OpenAPI contract cannot express on its own (empty-cart checkout, dangling product references, catalogue-gated writes, schema-forbidden quantities). It exists so the test runner can verify behaviors that are invisible to a purely contract-driven suite.

## Key elements

- **`probes: Probe[]`** (the sole export) — an array of four probe objects, each with `name`, `why`, `method`, `path`, `auth`, and an optional `body`. The `why` field serves as the inline rationale for why the probe exists.
- **Seed-token placeholders** — two probes reference `{{seedInactiveProductId}}` and `{{seedProductId}}` in their `path` or `body`. These are resolved at bundle time; the tokens are not valid in this file.
- **Type import** — `Probe` is imported (type-only) from `@guebbit/openapi-runnable-collections`.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** (referenced in the module header) — owns the probe infrastructure: what a probe is for, where probes are emitted, and which `{{seedToken}}` values are legal. This file is the data source that script consumes.

## Notes

- Probes are intentionally **request-only** — they carry no expected status code, response shape, or assertion. The `why` string is the sole documentation of intent.
- The `body` field is optional; probes without it (e.g. the empty-cart checkout) send a bare request.
- The two catalogue-gated probes (`POST /cart/items` with a nonexistent id, and `PATCH /cart/items/{id}` with an inactive id) exist to prove the *shared* service-layer check fires on both routes; they are not independent checks.
- Because no graph neighbors are registered, this file is a leaf in the dependency graph: it imports a type and exports a constant. Nothing else imports `probes` at the TypeScript level — the bundle script reads it by convention.
