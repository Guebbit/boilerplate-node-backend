---
source: src/modules/shop-tasks/openapi.tasks.yaml
sha256: 55c718437bbed84bc231e02cb5d8a305be4f8059828437f02eb4304385add725
generated_at: 2026-11-08T08:15:49.087815+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/openapi.tasks.yaml

## Purpose

OpenAPI contract fragment that extends the shared tasks contract with shop-specific values. It does not define a standalone API; instead it appends entries to the `TaskKind`, `TaskLinkType`, and `TaskCategory` enums declared in `../tasks/openapi.yaml` via the `x-extends` custom extension, so that a project with the shop module gets a richer task vocabulary while a shop-less project keeps only the base values (`contact`, `account_review`, `export_failed`).

## Key elements

- **`x-extends.TaskKind`** — eight shop-initiated task kinds appended to the base enum: `manual_refund_owed`, `refund_refused`, `amount_mismatch`, `dispute`, `dispute_awaiting_bank`, `refund_reversed`, `paid_without_hold`, `consent_due`.
- **`x-extends.TaskLinkType`** — four record-link types the shop's tasks can point at: `order`, `payment`, `refund`, `fulfillment_order`.
- **`x-extends.TaskCategory`** — four buyer-contact-message categories the shop introduces: `order`, `cancellation`, `return`, `payment`.
- **`info`** — identifies the fragment as "shop-tasks — tasks extension" v0.1.0 for tooling/discovery.

## Relationships

- **`src/modules/shop-tasks/module.ts`** — the module entry point that loads this fragment and registers it against the shared tasks contract during contract assembly. The fragment is inert unless the module is active in the project.

## Notes

- The extension mechanism is **additive only**: `x-extends` appends to the enum declared in `../tasks/openapi.yaml` (which marks its own values with `x-enum-from`). This file never redeclares the base values.
- The `tasks` module deliberately never names shop kinds; coupling flows one direction via the extension key, not via imports.
- Conventions for adding a new shop task kind: append to `x-extends.TaskKind` here, and ensure the corresponding `TaskLinkType` and `TaskCategory` entries exist if the task needs a record pointer or a buyer-visible category.
- Pattern reference: `docs/api/contract-fragmentation.md#extending-another-modules-contract`.
