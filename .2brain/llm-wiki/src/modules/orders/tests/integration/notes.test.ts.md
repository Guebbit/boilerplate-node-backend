---
source: src/modules/orders/tests/integration/notes.test.ts
source_sha256: 49c3512c0f3e934e0c0eaa74876f3f0cafafccd773b8d3aab4a5212030825be1
context_sha256: 8a8e843bb09ea5cb7a77f53ab111d210a0b6c786efbc57b3eea6712955cf5cfc
generated_at: 2026-11-22T06:30:01.757958+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/notes.test.ts

## Purpose
Integration tests for staff notes on an order: `POST /orders/{id}/timeline/notes` and `DELETE /orders/{id}/timeline/notes/{eventId}`. They run over real HTTP and real Mongo and check that a note is staff-only, stored encrypted, scrubbed on the text-retention clock and with order erasure, included in the buyer's data export, and withdrawable by staff.

## Key elements
- `jest.mock('@infrastructure/observability/audit', ...)`: replaces the audit port with `auditPortMock()` from `@tests/ports`. It is replaced rather than spied on.
- `setupTestDb()` and an `afterEach` that calls `resetDomainEvents()`.
- `NOTE`: a note containing a phone number (`0612345678`), so the redaction cases have personal data to remove.
- `seed()`: creates a signed-in buyer, a product, a paid order, and an admin. It returns the user, order, `orderId`, and the `buyer` and `staff` bearers.
- `leaveNote`, `leaveStatus`, `writeNote`, `deleteStatus`: helpers that POST a note, return the status, return the `Location` header, and DELETE a note.
- `describe('POST ...')`:
  - Returns 201 with a staff-only `note_added` entry and a `Location` pointing at the note's DELETE path.
  - The note is visible to staff in the timeline and invisible to the buyer.
  - The raw `orderEventModel` collection holds no plaintext.
  - A note row moved to another order makes `orderService.readTimeline` throw, because the order id is in the associated data.
  - `orderService.collectTimelineOf` includes the note without an `actor` field.
  - Audit via `ordersAuditActions.ADMIN_ORDER_NOTE_ADDED` records `metadata.length` and never the text.
  - A caller without `update:Order` gets 403 and nothing is written.
  - An unknown order gets 404; empty text or text over 2000 characters gets 422.
- `describe('the note's life after it is written')`:
  - `orderService.scrubTimelineText()` removes the text of a note older than `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS` and keeps the row.
  - When the buyer's data is erased (`eraseAsScheduled` followed by `orderService.anonymizeDueOrders()`), the note's text is scrubbed too.
- `describe('DELETE ...')`:
  - Returns 204, unsets the text, and keeps the row in the timeline and the export.
  - Audit via `ADMIN_ORDER_NOTE_DELETED` records the length only.
  - A second delete returns 404, as does a non-note row (such as `created`) or a note under a different order.
  - A caller without `update:Order` gets 403 and the text remains.

## Relationships
- **`../factories`** (orders), **`@modules/products/tests/factories`**, **`@modules/users/tests/factories`**: build orders, items and products, query the timeline, force order state (`markOrderPaidAt`, `forceOrderStatus`), and erase a user (`eraseAsScheduled`).
- **`../../services`** (`orderService`), **`../../model`** (`orderEventModel`), **`../../audit`** (`ordersAuditActions`): the code under test. The tests also read and modify the collection directly.
- **`@infrastructure/observability/audit`**: mocked, and `observePort` inspects the `emitAuditEvent` calls.
- **`@kernel/events`**: `resetDomainEvents` clears state between tests.
- **`@types`**: `OrderStatus`.
- **`tests/support/*`**:
  - `setup-test-db`: database lifecycle.
  - `http`: `api`, `authenticateAs`, `authenticateAsRole`.
  - `environment`: `setEnvironment`.
  - `ports`: `observePort`, `auditPortMock`.
  - `callers`: `asAdmin`.
  - `checkout-modules`: `registerCheckoutModules`, used in the erasure test.

## Notes
- Audit assertions filter `emitAuditEvent` calls by action. They check that the metadata contains only the text length and that the serialized event never contains "Monday".
- The erasure test backdates payment by about 3650 days and forces the order to `canceled`, so the erasure's claim window has passed.
- Deleting a note unsets only its text. The timeline row and its export entry remain.
