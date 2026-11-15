---
source: src/modules/shop-tasks/asyncapi.notifications.yaml
sha256: 2fdf30e5678f442a6175ae7eb2655d24a155f2f292e80540bc48bcb581107872
generated_at: 2026-11-14T21:49:49.429879+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/asyncapi.notifications.yaml

## Purpose

An AsyncAPI **fragment** (not a standalone document) that extends the shared `notifications` stream with 19 shop-specific payload variants — buyer messages and staff work notices. The bundler merges it into the stream's `NotificationPayload` union via `x-extends`; it only participates in the contract while the `shop-tasks` module exists.

## Key elements

- **`x-extends: NotificationPayload`** — appends 19 payload schema names to the stream's discriminated union (e.g. `NotificationStaffPurchaseHoldPlacedPayload`, `NotificationFulfillmentHeldPayload`, `NotificationCartLineRemovedPayload`, etc.).
- **`components/schemas/*ParamsPayload`** — the `params` objects each notification carries (e.g. `FulfillmentHeldParamsPayload`, `CartMergeRefusedParamsPayload`, `PurchaseHoldPlacedParamsPayload`).
- **`components/schemas/Notification*Payload`** — full notification envelopes: `id`, `audience` (`own` | `staff`), `code` (dotted enum like `shop-tasks.fulfillment-held`), `params` (ref to the matching `*ParamsPayload`), `severity`, `readAt` (optional), `createdAt`.
- All schemas use `additionalProperties: false` and a fixed `required` list.

## Relationships

- **`src/modules/shop-tasks/openapi.notifications.yaml`** — the OpenAPI twin. This file intentionally **repeats** the same payload shapes (rather than `$ref`-ing across formats) because each document is validated and code-generated independently; the two are kept in sync only by the producer being typed against both.
- **`src/modules/shop-tasks/module.ts`** — the module's existence is what keeps this fragment active. Deleting the module removes these 19 variants from the stream union, reverting it to the five base notices shared by all projects.

## Notes

- **Fragment, not document.** Do not open this file expecting a full AsyncAPI `channels`/`operations` block; it only contributes schema names and definitions.
- **Ordering matters.** Schemas are listed before the `x-extends` union that names them because the generated Zod types are `const` bindings — a forward reference would break generation.
- **Duplicated, not shared.** The schemas mirror `openapi.notifications.yaml` verbatim. If you change a shape, you must update **both** files; there is no cross-document `$ref`.
- **`NotificationStockAlertPayload` reuses `CartLineRemovedParamsPayload`** as its `params` — a deliberate shortcut, not a typo.
