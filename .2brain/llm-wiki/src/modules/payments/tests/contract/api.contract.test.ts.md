---
source: src/modules/payments/tests/contract/api.contract.test.ts
sha256: 6b089a28d9f2fda7b7d8316e770ebbc1d1fa3dbcf9029352aba1e9ba40897b6d
generated_at: 2026-10-15T11:32:58.395972+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/payments` HTTP route. They pin the observable API surface — status codes, response envelopes, `Location` headers, error codes, and field-level invariants (e.g. `providerRef` never leaks) — over real HTTP against a test database. Business-rule correctness (amounts, state transitions) is the unit suite's job; this file only verifies that each contract branch is reachable and shaped correctly.

## Key elements

- **`GOOD_METHOD` / `DECLINE_METHOD`** — Hardcoded provider method-reference literals (`pm_card_visa`, `pm_card_declined`). Deliberately *not* imported from the fake PSP so a rename in the double cannot silently invalidate the test.
- **`authenticateWithOrder()`** — Creates a user, a product, and a pending order via the factories; returns bearer token and order.
- **`authenticateWithIntent()`** — Builds on the above, then POSTs `/payments/intent` over HTTP; returns `paymentId`.
- **`transferOrder()`** — Creates a `bank_transfer` order with a `buildReference`-derived transfer reference pinned to the order's own id (mirroring checkout behaviour).
- **`paidOrder()`** — Drives intent → confirm over HTTP until the payment is `succeeded`; the fixture for refund tests.
- **`GET /payments/methods` block** — Verifies unauthenticated access and that `card` is present (or absent when no provider is configured).
- **"no card payment provider" block** — Uses `setEnvironment({ NODE_PAYMENT_PROVIDER: undefined })` to assert 409 `PAYMENT_CARD_NOT_AVAILABLE`, null repository state, and 404 on the webhook route.
- **`POST /payments/intent` block** — 201 + `Location` on first call, 200 without `Location` on repeat; 404 / 422 error shapes; `providerRef` absent, `clientSecret` present only here.
- **`POST /payments/{id}/confirm` block** — 200 success, 409 `PAYMENT_DECLINED`, 404 missing payment, 422 for malformed `paymentMethodRef` (spaces, too-short, too-long).
- Additional blocks (truncated) cover the webhook, refund, and order-reference-lookup routes.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/support/doubles/payments/fake.ts` | `setFakeOutcome` swaps the real PSP for a scripted double so confirm/webhook responses are deterministic. |
| `tests/support/http.ts` | `api()`, `authenticateAs`, `authenticateAsRole` provide the HTTP client and auth helpers. |
| `tests/support/contract.ts` | Imported for side-effects: registers the contract-test harness. |
| `tests/support/environment.ts` | `setEnvironment` toggles `NODE_PAYMENT_PROVIDER` to simulate the no-card deployment. |
| `src/modules/payments/providers/index.ts` | Exports `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER` used to forge a correctly signed webhook request. |
| `src/modules/payments/repository.ts` | `paymentRepository.findByOrderId` is queried directly to assert no row was created. |
| `src/modules/orders/index.ts` | `buildReference` mints the transfer reference; `ORDER_STATUS_CHANGED` is the event key for outbox assertions. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` build the prerequisite order fixtures. |
| `src/modules/products/tests/factories.ts` | `createProduct` supplies the line-item product. |
| `src/modules/inventory/index.ts` / `services/index.ts` | `inventoryService` referenced for inventory-related assertions. |
| `src/kernel/events.ts` | `onDomainEvent` subscribes to domain events fired during the test flow. |
| `src/kernel/outbox.ts` | `settleOutboxNudges` flushes pending outbox entries so event effects are observable. |

## Notes

- **Provider refs are literals on purpose.** The comment at the top of the `GOOD_METHOD`/`DECLINE_METHOD` definitions explains the rationale: importing from the fake would let a rename pass silently while the test loses meaning.
- **201 vs 200 idempotency is explicit.** RFC 9110 §15.3.2 is cited: first intent → 201 + `Location`; second → 200, no `Location`, same `id`.
- **`clientSecret` visibility is a two-sided assertion.** It must appear on the intent response *and* be absent from the read-back (`GET /payments/order/:id`). `providerRef` must be absent from *both*.
- **`setupTestDb()` runs at module scope** (before any `describe`), so the test DB is ready before the contract harness's `beforeAll` hooks fire.
- **The transfer-reference fixture pins the order id first**, then derives the reference from it — mirroring the production checkout sequence so the test exercises the same code path rather than a synthetic one.
