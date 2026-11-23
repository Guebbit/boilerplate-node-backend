---
source: src/modules/shop-tasks/tests/integration/tasks.test.ts
source_sha256: 932f07a3796cd1978ed841d58f47849e17964e0666bfbf0c6fae158c59bb1034
context_sha256: 91f2427780daa4536c88d72ebcfbb35b7f6e45f2338c9904b7c4790024bb6ac4
generated_at: 2026-11-22T07:45:44.115550+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/integration/tasks.test.ts

## Purpose
Integration test for the shop's staff to-do tasks, driven the way production drives them. It registers the real modules and emits payment, stock and delivery domain events with an outbox-style `eventId`. It then reads the resulting task back from storage and checks the staff's bell and mail. It pins which events open tasks, which clear them, the screen each alert opens, who is told, and how far the delay rule reaches. The engine's own rules (dedup, replays, staff closing first) are tested elsewhere, in `tasks`.

## Key elements
- **Mailer mock**: `@infrastructure/adapters/mailer` is replaced so `enqueueEmail` is a `jest.fn()` (`mockEnqueueEmail`). Cases assert which mail was enqueued.
- **`setupTestDb()`** and **`beforeEach`/`afterEach`**:
  - `beforeEach` resets the mail mock, sets `NODE_SUPPORT_EMAIL` and `NODE_LEGAL_COUNTRY` (`IT`) through `setEnvironment`, calls `resetDomainEvents()`, and runs `registerModules(enabledModules)`.
  - `afterEach` resets domain events and restores mocks.
- **Fixtures**:
  - ids: `PAYMENT`, `ORDER`, `RETURN`.
  - `nextEventId()` returns incrementing `event-N` ids.
  - event payloads: `MISMATCH_PAYLOAD`, `REFUND`, `REVERSAL`, `UNRECORDED`, `SHORT`, `DISPUTE`, `DELAY`.
- **`allTasks` / `onlyTask`**: read every stored task, or assert exactly one exists and return it. `allTasks` is `findAllTasks` from the tasks factories.
- **`OPENERS`**: a table of `[event, emit, TaskKind, routeSet, work screen]` rows, one per opener:
  - `payment.refund_owed_by_hand` → `manual_refund_owed`
  - final `payment.refund_failed` → `refund_refused`
  - `payment.refund_reversed` → `refund_reversed`
  - `payment.amount_mismatch` → `amount_mismatch` (route set `AuditDisplay`, work `sales/payments`)
  - `payment.refund_unrecorded` → `refund_unrecorded`
  - `payment.return_refund_short` → `return_refund_short` (route set `ReturnReceiving`, work `returns/<id>`)
  - `payment.dispute_opened` → `dispute`
  - `inventory.hold_orphaned` → `paid_without_hold` (route set `InventoryManagement`, work `orders/<id>`)
  - `fulfillment_order.delayed` (US) → `consent_due` (route set `OrderEditing`, work `orders/<id>`)
  - Most payment rows use route set `PaymentRefunding` and work `sales/payments?tab=attention`.
- **`describe('what opens a task')`**:
  - Each opener creates one task with the right `kind`, `routeSet` and `work`, plus `status: new`, `source: 'system'`, a defined `openKey` and a `Date` `dueAt`.
  - The mismatch task message carries the expected and received figures and links the payment.
  - A dispute is due at the provider's `evidenceDueBy`.
  - A consent reminder is due at the agreed date plus 30 days.
  - A repeated delay keeps the earlier due date.
  - Some events open nothing: a refund failure the sweep will retry, a delay shipping to `DE`, a delay with no `promisedAt`, and a dispute already `won`.
- **`standing(open)`**: spies on `paymentService.disputeStanding` to fake whether a dispute is open.
- **Disputed-refund `describe`**: covers refund failures and reversals whose `failureReason` is `disputed`. While a dispute is open, no separate to-do is opened. When none is open, the refund opens its own task (the rest of this case is not shown).

## Relationships
- Drives the real module set through `registerModules(enabledModules)` from `src/modules.ts` and `@kernel/registry`, and publishes through `@kernel/events` (`emitDomainEvent`, `resetDomainEvents`, `DomainEventMap`).
- Mocks `src/infrastructure/adapters/mailer.ts` so staff mail goes to a spy and not a real queue.
- Spies on `paymentService` from `src/modules/payments` for dispute standing. Also imports `paymentAttentionMinutes` from there, as well as `notificationsService` from `src/modules/notifications`, `shopTimezone`, `dayInZone` from `src/domain-primitives/time.ts`, `settleOutboxNudges` from `@kernel/outbox`, `callerInScope` from `@kernel/permissions`, `DEPLOYMENT_TENANT_ID` from `@kernel/access/tenant`, and the `createUser`/`asRole` helpers. These are imported in the visible part; their use lies in the part not shown.
- Reads tasks back through `@modules/tasks/tests/factories`.
- Uses `TaskKind`, `TaskStatus`, `TaskResolution` and `RefundFailureReason` from `@types`.

## Notes
- Events are emitted with an explicit `eventId` from `nextEventId()`, imitating the id the outbox stamps on production rows.
- `PAYMENT`, `ORDER` and `RETURN` are valid ObjectId strings because the system reads them back as ObjectIds (for example, to mail the order's buyer).
- Delay-rule tests depend on `NODE_LEGAL_COUNTRY: 'IT'`. A US-bound delay opens a consent task, while a DE-bound one does not.
