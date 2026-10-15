---
source: src/modules/orders/services/announce.ts
sha256: cfa0fc7a8ab1ea6ddd89da30870591fcffc63d65cf46fb019ceefdd2a93dfbf1
generated_at: 2026-10-15T11:06:49.828231+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/announce.ts

## Purpose

Defines the event-announcement factories for the orders module. Each factory returns a typed `OutboxAnnouncement` object that a calling service hands to `announceInTransaction`, ensuring the event row commits atomically with the order write it accompanies.

## Key elements

- **`createdEvent(orderId)`** — Builds the `ORDER_CREATED` announcement. Payload carries only `orderId`.
- **`statusChangedEvent(orderId, from, to)`** — Builds the `ORDER_STATUS_CHANGED` announcement for a landed status transition.
- **`statusOverriddenEvent(orderId, from, to, at)`** — Builds the `ORDER_STATUS_OVERRIDDEN` announcement. Serializes `at` (a `Date`) to an ISO string and hardcodes `mode: 'status'` in the payload.

All three set `aggregateId` to the `orderId`, which is what provides per-order ordering guarantees across `created`, `status_changed`, and `overridden` events.

## Relationships

- **`src/kernel/outbox.ts`** — Source of the `OutboxAnnouncement<T>` type that every factory returns.
- **`src/modules/orders/events.ts`** — Supplies the `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, and `ORDER_STATUS_OVERRIDDEN` name constants used as each announcement's `name`.
- **`src/types/index.ts`** — Supplies the `OrderStatus` union used in factory parameters.
- **`src/modules/orders/services/place.ts`**, **`status.ts`**, **`override.ts`** — Consumer services in the same module that invoke these factories and pass the result to `announceInTransaction`.

## Notes

- These are pure value-factory functions; they perform no I/O. The transactional guarantee comes from the caller pairing the returned object with the write inside a single transaction.
- `statusOverriddenEvent` is intended to be written *beside* a corresponding `statusChangedEvent` so that downstream consumers (e.g., `delivery`) can reconcile shipments at the override's own instant.
- The `at` field is serialized to an ISO-8601 string in the payload rather than passed as a `Date`, keeping the outbox row JSON-safe.
