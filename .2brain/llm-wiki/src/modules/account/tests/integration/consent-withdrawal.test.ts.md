---
source: src/modules/account/tests/integration/consent-withdrawal.test.ts
sha256: 9d92c66feafc4e528847a43fcab12ba8577d258ab9473e6281fa4b122ae7f9fe
generated_at: 2026-10-29T02:54:15.518006+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/consent-withdrawal.test.ts

## Purpose

Integration test verifying the full lifecycle of the `account.analytics_consent_withdrawn` outbox event: that it is written to the outbox *only* when stored analytics consent flips `true → false`, that the resolved analytics provider's `forget` method is invoked with the user id upon settlement, and that a provider failure leaves the row `pending` for retry.

## Key elements

- **`setupTestDb()`** — initialises an in-memory test database for the whole suite.
- **`withdrawnRows()`** — helper that returns lean outbox rows named `account.analytics_consent_withdrawn`.
- **`accountWith(consent, slug)`** — wraps `createUser` to produce a user in a specific consent state (`true`, `false`, or `undefined` for never-answered).
- **`afterEach`** — restores all jest mocks and calls `resetDomainEvents()` to clear the in-memory event bus.
- **"is written once when consent flips true to false"** — the happy-path write assertion (exactly one outbox row, correct `aggregateId` and `payload.userId`).
- **`it.each` non-flip table** — parameterised cases (`false→true`, `true→true`, `false→false`, `undefined→false`, `undefined→true`) asserting *zero* outbox rows.
- **"is not written by an edit that leaves consent alone"** — guards against spurious events from unrelated profile updates.
- **"makes the analytics provider forget the account id"** — spies on `resolveAnalyticsProvider().forget`, wires the module subscription, settles nudges, and asserts a single `[user.id]` call.
- **"keeps the row pending when the provider fails"** — mocks `forget` to reject, confirms the profile update still succeeds, and that the outbox row stays `pending` with `attempts: 1`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/module.ts` | Imported as `accountModule`; `subscribe()` is called to wire the withdrawal handler to the event bus. |
| `src/modules/account/services/index.ts` | `accountService.updateProfile` is the system-under-test entry point in every case. |
| `src/kernel/outbox.ts` | `outboxEventModel` queries persisted outbox rows; `settleOutboxNudges` triggers the outbox consumer loop in tests. |
| `src/kernel/events.ts` | `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` manage the in-memory domain-event bus between tests. |
| `src/infrastructure/observability/analytics/index.ts` | `resolveAnalyticsProvider` returns the provider instance that is spied on (`forget`). |
| `src/modules/users/tests/factories.ts` | `createUser` builds the seeded user documents. |
| `tests/support/setup-test-db.ts` | Provides the shared test database lifecycle. |
| `tests/support/callers.ts` | `testCallerContext` supplies the authenticated caller argument required by `updateProfile`. |

## Notes

- The test never touches PostHog (or any real analytics SDK) directly; correctness of the downstream effect is observed solely via the `forget` spy on the *resolved* provider instance.
- `markDomainEventsWired()` must be called **before** `accountModule.subscribe()` in the two dispatch tests; without it the handler is registered on an unwired bus and `settleOutboxNudges` will not invoke `forget`.
- The failure/retry test registers a no-op `onDomainEvent` listener to demonstrate the rejection originates from the provider, not the event bus itself.
- Outbox rows are queried with `.lean().exec()` to avoid Mongoose hydration overhead in assertions.
