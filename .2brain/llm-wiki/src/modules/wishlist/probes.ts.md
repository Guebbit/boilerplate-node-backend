---
source: src/modules/wishlist/probes.ts
sha256: ca58feabbb83cdb19c01f45a0b1e5c3a8357174b480c9115ffe2777f97d7d4b4
generated_at: 2026-10-29T06:34:45.235742+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/probes.ts

## Purpose

Exports the wishlist module's contract probes — a small set of HTTP requests that exercise behaviors the OpenAPI contract cannot express (saving a hidden product, operating on entries that were never saved, malformed IDs). The probes are consumed by the runnable-collections tooling to generate test traffic against a live or mock backend.

## Key elements

- **`probes: Probe[]`** — the single export. An array of four probe objects, each with `name`, `why` (human-readable rationale), `method`, `path`, `auth`, and optionally `body`.
- **Seed tokens** — `{{seedInactiveProductId}}` (POST body) and `{{seedSoftDeletedProductId}}` (DELETE path) are placeholders resolved at collection-generation time.
- **Literal ID paths** — the "never saved" and "invalid id" probes use concrete strings (`000000000000000000000000`, `not-an-object-id`) rather than seed tokens, because no real entity is expected to exist for them.

## Relationships

No graph neighbors. This file is a leaf: it imports only a type (`Probe`) from `@guebbit/openapi-runnable-collections` and is not imported by other modules in the dependency graph. Its consumer is `scripts/contracts/client-collections-bundle.ts`, which embeds these probes into the generated client-collections bundle (not a compile-time dependency, but a build-time reference).

## Notes

- The `why` field on each probe is intentionally verbose prose, not a doc-comment — it is surfaced directly in the generated collection UI for the human running the probes.
- The "move-to-cart" and "unsave" 404 probes are kept separate (despite testing the same "absent entry" scenario) because they hit different server code paths: move reads the list first, while delete filters in the repository. The probe set encodes that distinction.
- The invalid-ObjectId probe exists because the contract types `id` as a plain string; the ObjectId shape-check is a controller concern, so the probe guards that assumption explicitly.
