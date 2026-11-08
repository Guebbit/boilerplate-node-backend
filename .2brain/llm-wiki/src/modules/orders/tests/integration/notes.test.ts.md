---
source: src/modules/orders/tests/integration/notes.test.ts
sha256: 96aad03e0435620ffd9fa439cfaee1a4489538c882c8648d4eca9e2cefdf610e
generated_at: 2026-11-08T07:06:27.736948+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/notes.test.ts

## Purpose

Integration tests for the staff-note timeline rows on an order (`POST` and `DELETE /orders/{id}/timeline/notes`). Covers the full lifecycle—creation, staff-only visibility, encryption at rest, text-clock retention, erasure with the order, buyer data export, audit logging, and withdrawal—exercised over real HTTP against a real Mongo instance.

## Key elements

- **`seed()`** — Creates a paid order for a signed-in buyer and returns the buyer's and an admin's auth bearers plus the `orderId`.
- **`leaveNote` / `leaveStatus` / `writeNote` / `deleteStatus`** — Thin Supertest helpers for the two endpoints; `writeNote` resolves the `Location` header for later `DELETE` calls.
- **`describe('POST /orders/{id}/timeline/notes')`** — 201 shape + Location, staff-vs-buyer visibility, encryption-at-rest (raw collection scan), cross-order tamper rejection, buyer export (text present, author absent), audit records length only, 403 for non-staff, 404/422 edge cases.
- **`describe("the note's life after it is written")`** — Text-clock scrub (row kept, `text` unset after retention window) and erasure-with-order (`anonymizeDueOrders` scrubs the note text).
- **`describe('DELETE /orders/{id}/timeline/notes/{eventId}')`** — 204 + row kept without text, audit of withdrawal (length only), 404 on double-delete / wrong-order / non-note row, 403 for non-staff.
- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the audit port with `auditPortMock()` from `tests/support/ports.ts` so `observePort` can capture emitted events.
- **`setupTestDb()`** (before) and **`resetDomainEvents()`** (afterEach) — Real-Mongo lifecycle and domain-event cleanup.

## Relationships

- **`src/modules/orders/services/index.ts`** — `orderService` is called directly for `readTimeline`, `collectTimelineOf`, `scrubTimelineText`, and `anonymizeDueOrders`.
- **`src/modules/orders/model.ts`** — `orderEventModel` is used to inspect the raw Mongo collection, tamper rows, and verify post-scrub state.
- **`src/modules/orders/audit.ts`** — `ordersAuditActions` constants (`ADMIN_ORDER_NOTE_ADDED`, `ADMIN_ORDER_NOTE_DELETED`) are used to filter captured audit events.
- **`src/infrastructure/observability/audit.ts`** — The module is **replaced** (not spied on) via `jest.mock`; `observePort` from `tests/support/ports.ts` then captures calls.
- **`src/kernel/events.ts`** — `resetDomainEvents()` runs in `afterEach` to clear any queued domain events between tests.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, and `timelineOf` build the order fixtures and read timeline rows.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the SKU referenced in the order items.
- **`src/modules/users/tests/factories.ts`** — `eraseAsScheduled` triggers the buyer's personal-data erasure in the erasure test.
- **`src/types/index.ts`** — `OrderStatus.paid` is used to set the order state in `seed`.
- **`tests/support/callers.ts`** — `asAdmin()` provides the admin caller identity for the cross-order tamper test.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS` for the text-clock test.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires up the erasure pipeline only in the erasure test.
- **`tests/support/http.ts`** — `api`, `authenticateAs`, `authenticateAsRole` provide the Supertest instance and bearer tokens.
- **`tests/support/ports.ts`** — `observePort` and `auditPortMock` enable audit-event capture without a real audit sink.
- **`tests/support/setup-test-db.ts`** — Boots and tears down the real Mongo instance for the whole file.

## Notes

- The audit port is **replaced** with a mock via `jest.mock`, not wrapped with `jest.spyOn`. The file's comment points to `tests/support/ports.ts` for the rationale.
- The encryption-at-rest test reads the **raw Mongo collection** (`orderEventModel.collection.find`) rather than asserting on an API response, so it proves the DB payload is ciphertext.
- The text-clock test manually back-dates the row's `at` field in Mongo before calling `scrubTimelineText`; no real time elapses.
- `registerCheckoutModules()` is called **only** in the erasure test, not in global setup—other tests don't need the checkout pipeline.
- The cross-order tamper test calls `orderService.readTimeline` directly (not via HTTP) to confirm the service-layer guard rejects a note whose `orderId` no longer matches.
