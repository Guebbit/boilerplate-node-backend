---
source: src/modules/inventory/module.yaml
sha256: 4eb50fe5314056bf8a60d7c991547d510c35a065896a41e7dedd53f16ee4734e
generated_at: 2026-11-08T06:00:19.990105+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/module.yaml

## Purpose

Module manifest for the inventory subdomain. Declares this module as the **sole writer of stock** in the application, lists its cross-module dependencies with the reason each is needed, and registers its scheduled background jobs.

## Key elements

- **`summary`** – Contract statement: this module is the only stock writer.
- **`subdomain: supporting` / `group: shop`** – Categorisation within the project's module taxonomy.
- **`dependsOn`**
  - `products` – used for a shortfall's title and for syncing the catalogue's read-only stock cache.
  - `shop` – provides the calendar on which a preorder's release day is answered.
- **`jobs.sweepReservations`** (`sweep:reservations`) – Cron job running every 5 minutes (`*/5 * * * *`). Drains stale checkout holds in batches of 200 and cancels the order behind each hold.

## Relationships

- **`src/modules/inventory/openapi.yaml`** – Sits alongside this manifest in the same `src/modules/inventory/` directory; defines the API surface (endpoints, schemas) that the inventory module exposes, while this file governs the module's identity, dependencies, and jobs.
- **`products` module** (external dependency) – Inventory reads from it for shortfall titles and pushes updates to its read-only stock cache.
- **`shop` module** (external dependency) – Inventory consults the shop calendar when resolving a preorder's release date.

## Notes

- The 5-minute sweep interval is deliberately chosen to land inside **both** the card-hold window and the 168-hour bank-transfer window (per the inline comment); changing the schedule may cause holds to expire before the sweep runs.
- The "only writer of stock" declaration is a **contract**, not an enforcement mechanism. Other modules that mutate stock rows directly would violate this invariant.
- Batch size for the sweep is fixed at 200 per batch; there is no visible configuration knob for it in this file.
