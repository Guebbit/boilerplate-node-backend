---
source: src/modules/products/probes.ts
sha256: b55751c7a734446e62a3126fb2a46547dcf2bf823cda9eb93cece736ea267093
generated_at: 2026-11-08T07:46:12.850131+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/probes.ts

## Purpose

Exports the products module's probe collection — hand-written test requests that cover behaviors the OpenAPI contract cannot express (validation envelopes, i18n, optional filters, and visibility-state distinctions). It complements the auto-generated client collections owned by `scripts/contracts/client-collections-bundle.ts`.

## Key elements

- **`probes: Probe[]`** (exported) — Array of six `Probe` objects, each pairing a single HTTP request with a `why` rationale. Covers:
  - Schema-violating body → expects 422 with `errors[]`
  - `Accept-Language: it` on a generated GET → i18n diff
  - All optional query filters together (paging, price bounds, active flag)
  - Soft-deleted product → 404 anonymous vs. record for admin
  - Inactive product (`active: false`) → 404 anonymous
  - Off-sale product (`purchasable: false`) → visible to all; contrast with inactive
- **`Probe`** (type import) — from `@guebbit/openapi-runnable-collections`; shapes each entry (`name`, `why`, `method`, `path`, optional `auth`, `body`, `headers`).

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — Owns the rest of the collections pipeline (probe definition, emission targets, `{{seedToken}}` value assignment). This file is consumed by that pipeline rather than importing it directly.
- **`@guebbit/openapi-runnable-collections`** — Provides the `Probe` type that constrains the shape of each entry.

## Notes

- The `path` field in probes is a literal string with query params baked in (e.g. `/products?page=1&pageSize=5&…`), not a parameterized template — only `{{seed…}}` tokens are substituted at emission time.
- Probes are intentionally paired (soft-deleted vs. inactive vs. off-sale) so a reviewer can diff the two responses to confirm the distinct visibility rules. The `why` field on each entry is the expected comparison note.
- No `auth` field is set on the GET probes; the consumer is expected to send each visibility probe twice (with and without the admin token) to observe the scoping difference.
