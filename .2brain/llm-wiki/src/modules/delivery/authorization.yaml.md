---
source: src/modules/delivery/authorization.yaml
source_sha256: e4cdc50cb7e3db6dee38129aa7015cde3de44e94bddd054a9c31db330e7d59af
context_sha256: bec46f384971cb83c51c7e3287554120de3579a05bba6660d35955be907158fd
generated_at: 2026-11-22T04:44:56.326397+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/authorization.yaml

## Purpose
Declares the delivery module's authorization rules (action/subject permissions) and groups them into named permission sets. It defines who may act on shipments and on the start of order fulfillment.

## Key elements
- **Rule `update:Shipment`** (module `delivery`, scope `tenant`): covers cutting a shipment from a fulfillment order, recording arrival, correcting a tracking code, reporting a parcel lost or damaged, and holding or releasing a fulfillment order.
- **Rule `start:Shipment`** (module `delivery`, scope `tenant`): begins fulfilling a paid order, i.e. the move into `processing` before any parcel exists.
- **Set `DeliveryManagement`**: contains `update:Shipment`.
- **Set `DeliveryStart`**: contains `start:Shipment`.

## Relationships
- `src/modules/example/authorization.yaml` is a sibling authorization file. It appears to follow the same `rules` / `sets` layout, but this file doesn't reference it.
- `src/modules/delivery/openapi.yaml` is the delivery module's API spec. The comments in this file say `start:Shipment` gates `POST /orders/{id}/process`.

## Notes
- `start:Shipment` is deliberately narrower than `update:Order`. It lets the warehouse begin work on a paid order without granting broad access to the order record.
- Per the file's comments, `paid → processing` is `system`-only in `src/modules/orders/domain/lifecycle.ts`. The `POST /orders/{id}/process` endpoint calls `markProcessing` in `src/modules/orders/services/status.ts`.
- Rules are referenced in sets as `action:Subject` strings, for example `update:Shipment`.
