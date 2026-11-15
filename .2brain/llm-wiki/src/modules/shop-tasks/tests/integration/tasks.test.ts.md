---
source: src/modules/shop-tasks/tests/integration/tasks.test.ts
sha256: ff841c69a28a260ae11754a08d538aa01b3872c7e554488f5f85c32c14a5b539
generated_at: 2026-11-14T21:57:56.764730+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/tasks.test.ts

## Purpose

Integration test suite that drives the shop-task lifecycle exactly as production does: real modules are registered, domain events are emitted (with outbox-stamped `eventId`s), and the test reads tasks back from a live test database. It pins which events open which task kind/route/set/screen, which events close them, how due dates are computed (provider deadlines, agreed + 30 days, keep-earlier rule), how the delay jurisdiction rule follows the shop's legal country, and that the correct staff receive bell and mail notifications. Engine-internal rules (dedup, replays, staff-closes-first) are covered in a separate `tasks` unit test.

## Key elements

- **`OPENERS`** — table of seven (event-name, emit-fn, `TaskKind`, route-set, work-screen) tuples covering refund-owed, refund-refused (final), refund-reversed, amount-mismatch, dispute-opened, hold-orphaned, and fulfillment-delay (US). Drives an `it.each` that asserts a single new system task with the expected fields.
- **"opens nothing" table** — six negative cases (non-final retryable failure, disputed reversal, out-of-rule ship country, missing `promisedAt`, already-won dispute) that must produce zero tasks.
- **Delay-rule block** — asserts the rule fires when the shop's `NODE_LEGAL_COUNTRY` is `US` (any destination or missing destination), and also fires when the ship-to is `US` regardless of shop country.
- **Closers** — `it.each` pairs of (open-event + close-event) verifying that the closing event resolves the task (refunded, refund-canceled, refunded-after-reversal, dispute-lost, order-canceled, shipped).
- **`onlyTask` / `allTasks`** — thin wrappers over `findAllTasks` that assert exactly one task exists before returning it.
- **`nextEventId`** — monotonically increasing `event-N` string simulating the outbox relay stamp.
- **Mailer mock** — `enqueueEmail` is jest-mocked; tests assert who is told (staff bell/mail) rather than asserting the email queue.
- **`beforeEach`** — resets the mail mock, sets `NODE_SUPPORT_EMAIL` / `NODE_LEGAL_COUNTRY`, resets domain events, and re-registers `enabledModules`.

## Relationships

- **`src/kernel/registry.ts`** (`registerModules`) — wires the real module graph so handlers actually subscribe to events.
- **`src/modules.ts`** (`enabledModules`) — the list passed to `registerModules`; determines which task openers/closers are active.
- **`src/kernel/events.ts`** (`emitDomainEvent`, `resetDomainEvents`, `DomainEventMap`) — the sole trigger mechanism; every test action is an event emission.
- **`src/kernel/outbox.ts`** (`settleOutboxNudges`) — flushed so outbox-stamped events reach handlers within the test.
- **`src/infrastructure/adapters/mailer.ts`** (`enqueueEmail`) — mocked; assertions verify the notification target.
- **`src/kernel/access/tenant.ts`** (`DEPLOYMENT_TENANT_ID`) — scopes the test tenant.
- **`src/kernel/permissions.ts`** (`callerInScope`) — used to act as a specific role for permission-sensitive assertions.
- **`src/modules/shop/index.ts` / `service.ts`** (`shopTimezone`) — provides the shop's timezone for due-date assertions.
- **`src/domain-primitives/time.ts`** (`dayInZone`) — timezone-aware day arithmetic for delay-rule date math.
- **`src/modules/notifications/…`** — the service that actually enqueues bell + mail; exercised transitively through the mailer mock.
- **`src/modules/payments/…`** — payment service whose handlers react to the emitted refund/dispute events.
- **`src/modules/tasks/tests/factories.ts`** (`findAllTasks`) — reads tasks from the test DB for assertions.

## Notes

- The mailer is **mocked**, not the notifications service: the test asserts *who* is notified by inspecting `enqueueEmail` call arguments, not by inspecting the notifications module's internal state.
- `NODE_LEGAL_COUNTRY` controls the delay-rule jurisdiction. Tests that need a US shop call `setEnvironment` with `NODE_LEGAL_COUNTRY: 'US'`; the default in `beforeEach` is `'IT'`.
- Due-date "keep earlier" rule: emitting a second delay with a later `promisedAt` must not push the existing `dueAt` forward.
- The `it.each` tables use `as const` tuples; the emit function is the second element, so the test name comes from the first element (a human-readable label).
- The file is an integration test by design: it uses `setupTestDb()` (real MongoDB) rather than in-memory mocks for the task store.
- Truncated in the snapshot above; the closers table and any notification-recipient assertions continue past the visible cut.
