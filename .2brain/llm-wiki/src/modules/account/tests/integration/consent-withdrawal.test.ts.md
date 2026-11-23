---
source: src/modules/account/tests/integration/consent-withdrawal.test.ts
generated_at: 2026-11-22T03:53:21.067787+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/consent-withdrawal.test.ts

## Purpose
Integration test for the `account.analytics_consent_withdrawn` outbox event. It verifies that the event is written alongside the profile save only when stored analytics consent flips `true → false`, and that the analytics provider's `forget` is called with the account id in response. PostHog itself is never called; `forget` is spied on the resolved provider.

## Key elements
- `setupTestDb()` — sets up the test database for the suite.
- `withdrawnRows()` — queries `outboxEventModel` for rows named `account.analytics_consent_withdrawn` (lean, plain objects).
- `accountWith(consent, slug)` — creates a user via `createUser`. `undefined` means consent was never answered; otherwise sets `analyticsConsent` and `analyticsConsentAt`.
- `afterEach` — restores mocks and calls `resetDomainEvents()`.
- Test cases, all driven through `accountService.updateProfile(...)` with `testCallerContext`:
  - `true → false` writes exactly one row with `aggregateId` and `payload.userId` equal to the user id.
  - A `it.each` table covers non-withdrawal transitions (false→true, true→true, false→false, undefined→false, undefined→true); none write a row.
  - An edit that does not touch consent (a username change) writes no row.
  - Withdrawal makes `resolveAnalyticsProvider().forget` be called once with the user id.
  - If `forget` rejects, `updateProfile` still succeeds and the row stays `pending` with `attempts: 1`, so the deletion is retried.

## Relationships
- `@tests/setup-test-db` and `@tests/callers` (`tests/support/…`) provide the DB setup and `testCallerContext`.
- `@modules/users/tests/factories` — `createUser` builds the fixture accounts.
- `@modules/account/services/index.ts` — exports `accountService`, whose `updateProfile` is the code under test.
- `../../module` (`accountModule`) — `subscribe()` registers the account module's event handlers, which route the withdrawal event to the analytics provider.
- `@kernel/outbox` — `outboxEventModel` is read to inspect rows; `settleOutboxNudges()` waits for outbox dispatch to finish.
- `@kernel/events` — `markDomainEventsWired`, `onDomainEvent` and `resetDomainEvents` control the domain event bus in tests.
- `@infrastructure/observability/analytics` — `resolveAnalyticsProvider()` supplies the provider whose `forget` is mocked.

## Notes
- The two dispatch tests call `markDomainEventsWired()` and `accountModule.subscribe()` before acting. The write-only tests do not, so they exercise only the outbox write.
- The failure test registers an unrelated `onDomainEvent` listener to show that the failure comes from the provider and not from the event bus.
- `resetDomainEvents()` in `afterEach` keeps subscriptions from leaking between tests.
