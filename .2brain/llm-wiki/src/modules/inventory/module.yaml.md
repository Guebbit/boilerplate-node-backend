---
source: src/modules/inventory/module.yaml
source_sha256: afc0ce0afa864598db288de594dcf92b573c235b77e5f88b21720d88c7edb9cf
context_sha256: b447dcc177fe946aa8a73a2bbc5812a39eeccf5e168ecb21f8db36b188e46c7d
generated_at: 2026-11-22T05:19:56.555399+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/module.yaml

## Purpose
Declares the metadata and scheduled jobs of the `inventory` module. Its summary states that it is "the only writer of stock in the application." It is classified as a `supporting` subdomain in the `shop` group.

## Key elements
- `summary`: one-line description of the module's role (sole writer of stock).
- `subdomain: supporting` and `group: shop`: classification of the module.
- `dependsOn`: declares dependencies on two modules:
  - `products`: supplies a shortfall's title and the terms the availability read judges.
  - `shop`: supplies the calendar on which a preorder's release day is answered.
- `jobs.sweepReservations`: a scheduled job.
  - `name`: `sweep:reservations`
  - `schedule`: `'*/5 * * * *'` (every 5 minutes).
  - `summary`: drains every stale checkout hold in batches of 200 and cancels the order behind each.

## Relationships
- `module.ts` sits next to this file in the same module directory. The YAML itself doesn't reference it, so how the two connect (for example, the job's implementation) isn't visible here.
- `asyncapi.domain-events.yaml` is also in the same module directory. This file makes no reference to it.

## Notes
- A comment on the schedule says the 5-minute interval is chosen to sit well inside both the card payment window and the 168-hour bank-transfer window.
