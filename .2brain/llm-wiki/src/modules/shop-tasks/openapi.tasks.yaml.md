---
source: src/modules/shop-tasks/openapi.tasks.yaml
source_sha256: 8f5ac168a10b1f1d1561191440f6d5623951d7cae6902c2ee6b6760ea864a403
context_sha256: 5722d624fa12066f6138181336b0ffaf357b3da08d6f4f3e6c32a8cca63b3d4c
generated_at: 2026-11-22T07:42:09.474125+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/openapi.tasks.yaml

## Purpose
An OpenAPI 3.1 fragment (`shop-tasks — tasks extension`, version `0.1.0`) that adds the shop's values to the tasks contract. It declares the kinds of to-do the shop opens by itself, the record types those tasks link to, and the categories a buyer's contact message can name. It lives apart from the tasks contract so a project without a shop doesn't carry these values.

## Key elements
All three lists sit under the `x-extends` key. Each is appended to the enum of the same name in the tasks contract.
- `TaskKind`: `manual_refund_owed`, `refund_refused`, `amount_mismatch`, `dispute`, `dispute_awaiting_bank`, `refund_reversed`, `paid_without_hold`, `consent_due`, `refund_unrecorded`, `return_refund_short`.
- `TaskLinkType`: `order`, `payment`, `refund`, `dispute`, `fulfillment_order`, `return`.
- `TaskCategory`: `order`, `cancellation`, `return`, `payment`.

## Relationships
- `src/modules/tasks/openapi.yaml` is the base contract. It declares `x-enum-from` beside its own enum values, and this file's `x-extends` lists are appended to the enums of the same names there. `tasks` never references this file. Without the shop, only the base values remain (`contact`, `account_review`, `export_failed`, per the header comment).

## Notes
- The file defines no paths or schemas of its own, only the `x-extends` lists.
- The enum names (`TaskKind`, `TaskLinkType`, `TaskCategory`) must match the enums in the tasks contract for the extension to apply.
- The header comment refers to a "Extending another module's contract" section of a contract-fragmentation doc for how the extension mechanism works. The path it cites does not exist in this repository. The fragment-handling code is likely in `scripts/contracts/fragments.ts`.
