---
source: src/modules/orders/module.yaml
sha256: ce9e813602041dd514eab7ba3e1bc2f23fe8c30511a8665ade9c3d781d11d1a7
generated_at: 2026-10-15T11:05:08.555541+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/module.yaml

## Purpose

Module descriptor for the **orders** subdomain. It declares what a checkout produces (status machine, totals, invoice link), assigns the module to the `shop` group under the `core` subdomain, and lists its four upstream dependencies with a one-line justification for each.

## Key elements

- **summary** — One-sentence domain description: a checkout's status machine, its totals, and its invoice link.
- **subdomain: core / group: shop** — Placement in the domain taxonomy.
- **dependsOn** — Four declared dependencies, each annotated with *why* it is needed:
  - `access` — rank rule: staff may only modify orders of users ranked below them.
  - `inventory` — a claim on units; released on cancel or `RESERVATION_EXPIRED`.
  - `products` — a line copies catalogue-row fields at purchase time (snapshot, not live reference).
  - `users` — buyer's stored locale for email; a hard-delete on the user triggers an "erase hook" here.

## Relationships

- **src/modules/orders/module.ts** — The TypeScript implementation this YAML describes; the descriptor provides the metadata and dependency contract that the code enforces.
- **src/modules/orders/openapi.yaml** — OpenAPI spec for the orders endpoints in the same module directory.
- **src/modules/payments/module.ts** — Downstream consumer: the `summary` explicitly references the "invoice link," indicating orders hand off to the payments module.

## Notes

- The `dependsOn` comments are load-bearing documentation; they state the *contract* (e.g. "released on cancel or RESERVATION_EXPIRED") rather than just naming the dependency. Treat them as the source of truth for cross-module invariants.
- The `users` dependency is asymmetric: orders only reads a locale field, but a **hard delete** of a user triggers an "erase hook" *in* orders — a one-way event with a two-way effect.
- `products` is a snapshot at purchase time, not a live join. Changing a catalogue row does not retroactively alter existing order lines.
