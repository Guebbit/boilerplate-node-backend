---
source: src/infrastructure/config/shared-rules/frontend-links.ts
sha256: 89247c7e6a85c177a5dfe34977715259c50e3d9dbcccf71e6c344ffaca46c9b1
generated_at: 2026-11-14T17:57:16.594797+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/frontend-links.ts

## Purpose

Defines the Zod schema for the shared-rules file that stores frontend URL path templates. The backend uses these templates to build user-facing links (transactional mail, sitemap) and staff-screen links (work-notice mail). This module gives those values a typed, validated shape at load time.

## Key elements

- **`template`** — internal helper; `z.string().min(1)` ensuring every path value is a non-empty string.
- **`frontendLinksSchema`** (exported) — `z.strictObject` with three top-level keys:
  - `links` — 12 path templates for user-facing routes under `/<locale>/` (verify, reset, setup, restore, emailChange, emailUndo, export, order, product, contact, privacy, terms).
  - `staffPages` — 18 path templates for staff screens under `/<locale>/`, covering entity pages (user, webhookSubscription, task, return, order, inventory, salesPayments) and dashboard summary tabs (transfersDue, preordersLate, deliveryHoldsOpen, returnsAwaitingGoods, returnsUndecided, lowStock, unshipped, awaitingTracking, undelivered, staleRefunds).
  - `staticPages` — `z.array(z.string())`; public pages that take no id. The empty string represents the home page.

## Relationships

- **`registry.ts`** — Registers `frontendLinksSchema` so the shared-rules loader can parse and validate the YAML data alongside the other rule files.
- **`src/infrastructure/http/frontend-link.ts`** — Consumes the parsed values (typed by this schema) to interpolate locale and resource ids into the final URLs used in HTTP responses and mail bodies.

## Notes

- All objects use `z.strictObject`, so any extra key in the source YAML will fail validation.
- The module doc-block notes that imports must be relative (see `load.ts`), a project-wide convention for this directory.
- `links` and `staffPages` keys are intentionally distinct names for different audiences (end-user vs. staff); do not merge them.
- `staticPages` is a free-form string array with no per-entry constraints beyond being a string; ordering and membership are application-specific.
