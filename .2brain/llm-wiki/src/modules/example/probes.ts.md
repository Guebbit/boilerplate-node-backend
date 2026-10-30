---
source: src/modules/example/probes.ts
sha256: 0d2fcf5e644542ded6e2cf7d120eb7e72ce4c062c7f1ab69ebbb696fc94daed7
generated_at: 2026-10-29T03:53:52.713145+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/probes.ts

## Purpose
Declares the example module's collection of API probes — requests that exercise refusal paths the OpenAPI contract cannot express on its own. The bundle script (`scripts/contracts/client-collections-bundle.ts`) consumes this array to run them against a live server. The file is explicitly marked as deletable once every refusal becomes contract-reachable.

## Key elements
- **`probes: Probe[]`** (exported const) — The sole export. An array of three `Probe` objects (type imported from `@guebbit/openapi-runnable-collections`):
  - Anonymous `GET /examples/<fake-id>` — verifies the 404 for an unheld id is indistinguishable from a 404 for someone else's draft.
  - Bearer-auth `POST /examples/<fake-id>/publish` — verifies ownership is checked before move-legality, yielding 404 (not 409) for a stranger.
  - Bearer-auth `PATCH /examples/not-an-object-id` — verifies a non-Mongo-shaped id in the path is refused with the same 404 as a genuinely absent id.

## Relationships
No graph neighbors are recorded. The file is a leaf: it imports only a type from `@guebbit/openapi-runnable-collections` and is consumed externally by `scripts/contracts/client-collections-bundle.ts` (referenced in the module doc-comment, not imported here).

## Notes
- The module doc-comment states a deletion criterion: remove this file when every refusal the module can produce is already reachable from its contract. Treat the file as temporary by design.
- Probe `path` values use a zero-padded fake id (`000000000000000000000000`) and a literal `not-an-object-id` string; these are not real ObjectIds and must not be "fixed" to valid hex.
- See `docs/api/contract-fragmentation.md` for the broader rationale on why probes exist alongside contracts.
