---
source: shared/rules/schemas/frontend-links.generated.schema.json
sha256: 8d031857215e6c1cb8dc13285d316d8409adf329ac26452a92abca5780ad68a8
generated_at: 2026-11-14T17:46:56.394980+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/frontend-links.generated.schema.json

## Purpose

A JSON Schema (draft 2020-12) that validates the shape of a frontend-link configuration object. It enforces a fixed, closed set of route/link keys for public pages, staff dashboard pages, and a list of static pages — ensuring any conforming config provides non-empty route strings for every expected entry.

## Key elements

- **Root object** — requires exactly three properties (`links`, `staffPages`, `staticPages`); `additionalProperties: false` at every level.
- **`links`** (object) — 12 required keys (`verify`, `reset`, `setup`, `restore`, `emailChange`, `emailUndo`, `export`, `order`, `product`, `contact`, `privacy`, `terms`). Each must be a non-empty string. No extra keys allowed.
- **`staffPages`** (object) — 17 required keys covering staff-facing routes (`user`, `webhookSubscription`, `task`, `return`, `order`, `inventory`, `salesPayments`, `transfersDue`, `preordersLate`, `deliveryHoldsOpen`, `returnsAwaitingGoods`, `returnsUndecided`, `lowStock`, `unshipped`, `awaitingTracking`, `undelivered`, `staleRefunds`). Each must be a non-empty string. No extra keys allowed.
- **`staticPages`** (array of strings) — a free-form list; no length or item constraints beyond string type.
- **`minLength: 1`** on every string property — prevents empty-string route values.

## Relationships

No graph neighbors detected for this file.

## Notes

- The `.generated` suffix in the filename indicates this schema is produced by an automated pipeline; do not hand-edit it. Regenerate from the source of truth if the link set changes.
- Both `links` and `staffPages` use `additionalProperties: false`, so adding a new route key without updating this schema will cause validation failures.
- `staticPages` has no item constraints (e.g., `minLength`), unlike the other string fields — it only checks that each entry is a string.
- The schema itself is data (a JSON document), not executable code; it is consumed by whatever tooling performs validation (e.g., CI checks, editor integrations).
