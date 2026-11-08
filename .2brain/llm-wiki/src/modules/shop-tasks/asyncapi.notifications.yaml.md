---
source: src/modules/shop-tasks/asyncapi.notifications.yaml
sha256: 9c5b22314493f55410ea739ca74bec437948636684dfab81846bbefd183e45bb
generated_at: 2026-11-08T08:13:54.882248+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/asyncapi.notifications.yaml

## Purpose

An AsyncAPI **fragment** (not a standalone document) that extends the global `NotificationPayload` union with every buyer-message and staff-work-notice payload the shop-tasks module emits. It is the AsyncAPI-side mirror of `./openapi.notifications.yaml`; the bundler (`scripts/contracts/asyncapi-section-fragments.ts`) merges it into the `notifications` section only while this module exists. Deleting the module removes these payloads and the stream falls back to the five base notices every project shares.

## Key elements

- **`x-extends.NotificationPayload`** – Lists 19 payload schemas appended to the shared `NotificationPayload` union (e.g. `NotificationStaffPurchaseHoldPlacedPayload`, `NotificationFulfillmentHeldPayload`, `NotificationShipmentLostPayload`, `NotificationStockAlertPayload`, `NotificationFulfillmentDelayedPayload`, `NotificationCartLineRemovedPayload`, `NotificationWishlistItemRemovedPayload`, `NotificationCartMergeRefusedPayload`, plus several `NotificationStaff*` variants).
- **`components.schemas.*ParamsPayload`** – Parameter sub-objects shared across notification payloads (e.g. `PurchaseHoldPlacedParamsPayload`, `FulfillmentHeldParamsPayload`, `ShipmentLostParamsPayload`, `FulfillmentDelayedParamsPayload`, `CartLineRemovedParamsPayload`, `CartMergeRefusedLinePayload` / `CartMergeRefusedParamsPayload`).
- **`components.schemas.Notification*Payload`** – Full notification envelope schemas, each requiring `id`, `audience` (`own` | `staff`), `code` (a single `shop-tasks.*` string), `params`, `severity` (`info` | `success` | `warning` | `error`), and `createdAt`; `readAt` is optional.

## Relationships

- **`src/modules/shop-tasks/module.ts`** – The module's existence is the merge condition: the bundler includes this fragment in the generated AsyncAPI contract only while this module is present. Removing the module (or deleting this file) drops all listed payloads from the stream.
- **`src/modules/shop-tasks/openapi.notifications.yaml`** – The OpenAPI/REST counterpart defining the same notification variants for the HTTP API. Schemas are **repeated** here rather than cross-referenced so each document validates and generates Zod schemas independently; the producer is typed against both to keep them in sync.

## Notes

- This is a **fragment**, not a complete AsyncAPI document. It has no top-level `channels` or `operations`; it only contributes schemas and the `x-extends` directive.
- Schemas are deliberately duplicated from the OpenAPI file (not `$ref`'d across files) because each contract is validated and code-generated in isolation.
- Order matters: member schemas are listed **before** the `x-extends` union entry that references them, because the generated Zod schemas are emitted as `const` declarations.
- `additionalProperties: false` is set on every object schema; adding a new field requires updating both this file and its OpenAPI twin.
- The `titles` field in several param schemas is a locale-keyed map (`Record<string, string>`), not a single string.
