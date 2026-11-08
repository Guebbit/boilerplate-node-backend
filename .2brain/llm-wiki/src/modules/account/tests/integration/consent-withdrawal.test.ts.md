---
source: src/modules/account/tests/integration/consent-withdrawal.test.ts
sha256: 9d92c66feafc4e528847a43fcab12ba8577d258ab9473e6281fa4b122ae7f9fe
generated_at: 2026-11-08T04:34:56.999795+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/consent-withdrawal.test.ts

## Purpose

Integration test for the `account.analytics_consent_withdrawn` outbox event. Verifies that the event is written to the outbox **only** when stored consent transitions `true → false`, and that the downstream analytics provider's `forget` method is invoked exactly once per withdrawal. Also confirms the outbox retry path keeps the row `pending` when the provider rejects.

## Key elements

- **`withdrawnRows()`** – Queries the `outboxEventModel` for rows named `account.analytics_consent_withdrawn`; used in every assertion about whether the event was written.
- **`accountWith(consent, slug)`** – Test helper wrapping `createUser`; builds a user with a given `analyticsConsent` state (`undefined` = never answered) and a unique email/username.
- **`describe('account.analytics_consent_withdrawn')`** – The suite containing five cases:
  - *true → false* writes exactly one outbox row with the user's id in the payload.
  - *Parameterized negative cases* (false→true, true→true, false→false, undefined→false, undefined→true) assert **no** row is written.
  - *Unrelated edit* (username change) leaves consent untouched; no row.
  - *Happy-path forget*: spies `resolveAnalyticsProvider().forget`, wires events via `markDomainEventsWired` + `accountModule.subscribe()`, settles nudges, and asserts `forget` was called with the user id.
  - *Provider failure*: mocks `forget` to reject, adds a no-op probe listener to prove the bus itself is fine, and asserts the outbox row stays `pending` with `attempts: 1`.

## Relationships

- **`@kernel/outbox`** – `outboxEventModel` is the query target for all assertions; `settleOutboxNudges` triggers the outbox processor so subscribers run.
- **`@kernel/events`** – `markDomainEventsWired` / `resetDomainEvents` gate the event bus; `onDomainEvent` is used in the retry test as a probe listener.
- **`../../module`** (`accountModule`) – Its `.subscribe()` registers the account module's handler that calls the analytics provider.
- **`@modules/account/services`** – `accountService.updateProfile` is the system under test; every case drives the scenario through this single call.
- **`@infrastructure/observability/analytics`** – `resolveAnalyticsProvider()` returns the provider whose `forget` method is spied/mocked; PostHog itself is never imported or called.
- **`@modules/users/tests/factories`** – `createUser` supplies seeded users.
- **`tests/support/setup-test-db`** / **`tests/support/callers`** – DB bootstrap and a canned caller context for auth.

## Notes

- **Consent flip is strictly `true → false`.** Setting consent for the first time (`undefined → false`) does *not* emit the event—this is intentional and covered by the parameterized case.
- **Provider is observed, not the vendor.** The test asserts on `resolveAnalyticsProvider().forget`, keeping the suite agnostic to the concrete analytics SDK (PostHog, etc.).
- **Retry proof pattern:** The failure test registers a trivial `onDomainEvent` listener so that if the outbox row were marked `failed` rather than `pending`, you could rule out a bus-level rejection.
- **Teardown:** `afterEach` restores all Jest mocks and calls `resetDomainEvents()` to prevent cross-test subscription leakage.
