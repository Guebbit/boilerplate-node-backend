---
source: src/modules/orders/services/announce.ts
sha256: 9e741429e12e2c12fe536e5670fa01b173f284a6dbf0675b1ccd27788ec5a969
generated_at: 2026-11-08T06:55:54.701753+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/announce.ts

## Purpose

Factory functions that build typed `OutboxAnnouncement` payloads for order lifecycle events. Each returned object is passed to `announceInTransaction` so the event row commits atomically with the corresponding status write (or not at all), guaranteeing per-order event ordering via a shared `aggregateId`.

## Key elements

- **`statusChangedEvent(orderId, from, to)`** — Builds an `ORDER_STATUS_CHANGED` announcement for a landed status transition.
- **`createdEvent(orderId)`** — Builds an `ORDER_CREATED` announcement for a newly written order.
- **`statusOverriddenEvent(orderId, from, to, at)`** — Builds an `ORDER_STATUS_OVERRIDDEN` announcement; serialises `at` to ISO-8601 in the payload and tags `mode: 'status'`. Written alongside the paired `statusChangedEvent` so downstream `delivery` can reconcile at the override's own instant.

All three use `orderId` as the `aggregateId`, which is what gives per-order ordering across `created`, `status_changed`, and `canceled`.

## Relationships

- **`src/modules/orders/events.ts`** — Supplies the event-name constants (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_STATUS_OVERRIDDEN`) used as the `name` field of each announcement.
- **`src/kernel/outbox.ts`** — Provides the `OutboxAnnouncement<T>` return type; the produced objects are consumed by `announceInTransaction` (exported from that module) to persist the event row.
- **`src/types/index.ts`** — Provides the `OrderStatus` type used in function signatures.
- **`src/modules/orders/services/status.ts`** — Calls `statusChangedEvent` when a status write lands.
- **`src/modules/orders/services/place.ts`** — Calls `createdEvent` when a new order is written.
- **`src/modules/orders/services/override.ts`** — Calls `statusOverriddenEvent` (paired with `statusChangedEvent`) when an override lands.

## Notes

- `statusOverriddenEvent` serialises `at` via `.toISOString()` at call time; the payload stores a string, not a `Date`. Consumers should expect an ISO string.
- The `mode: 'status'` field in the override payload distinguishes status-mode overrides from other override kinds; it is a literal, not derived from a constant.
- The module is pure: no side effects, no I/O. All persistence is the caller's responsibility via the outbox.
