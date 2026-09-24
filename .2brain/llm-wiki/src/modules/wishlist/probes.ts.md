---
source: src/modules/wishlist/probes.ts
sha256: a843f076838adb50d7229045da8cd582de7054f4b469d5725d7354b7341c78d1
generated_at: 2026-09-23T19:47:57.904875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/probes.ts

## Purpose

Exports a fixed set of wishlist HTTP probes — requests that exercise edge cases the OpenAPI contract structurally cannot describe (e.g. "save a product that will 404 on read"). The probes exist so automated collections can hit those gaps; they are intentionally kept separate from the contract bundle.

## Key elements

- **`probes: Probe[]`** — The sole export. An array of four `Probe` objects (type from `@guebbit/openapi-runnable-collections`), each with `name`, `why`, `method`, `path`, `auth`, and optional `body`.
  - *Save a hidden product* (`POST /wishlist`): uses `{{seedInactiveProductId}}` to trigger a 404-on-read row.
  - *Move an unsaved product* (`POST /wishlist/{{seedSoftDeletedProductId}}/move-to-cart`): expects 404 rather than silent success.
  - *Unsave an unsaved product* (`DELETE /wishlist/000000000000000000000000`): exercises the delete code path's "filter matches nothing" branch.
  - *Malformed id* (`DELETE /wishlist/not-an-object-id`): verifies 422 is distinct from 404 for non-ObjectId strings.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — Owns the emission of these probes into client collections and defines which `{{seedToken}}` values (e.g. `{{seedInactiveProductId}}`, `{{seedSoftDeletedProductId}}`) are valid. This file is the data source the bundle consumes.

## Notes

- The file self-describes as "requests the contract cannot describe" — it is not a spec, only test-case data.
- Seed tokens are opaque strings here; their semantics and allowed set live in the contract bundle, not in this file.
- The last probe hard-codes a non-ObjectId literal (`not-an-object-id`) rather than using a seed token, because no token can represent "invalid format."
- All probes use `auth: 'bearer'`; none is anonymous.
