---
source: src/modules/cart/tests/integration/stock.test.ts
sha256: 6221926951864071063f53ec55b776939573d2e889ff679f0e544fd3255b20f1
generated_at: 2026-10-14T15:18:47.745219+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/stock.test.ts

## Purpose

Integration suite verifying the reservation invariant across the full order lifecycle: units are held (reserved) at checkout, not sold; they leave `onHand` only after payment; and they are recoverable via cancellation or TTL expiry. Runs against a real Mongo instance because the guarantees depend on conditional writes that mocks cannot represent.

## Key elements

- **`describe('checkout holds units without selling them')`** — primary suite. Covers: successful reservation, over-quantity refusal, all-units-held-by-another refusal, multi-line shortfall reporting, rollback of earlier holds on partial failure, and a concurrent last-unit race (two `Promise.all` checkouts).
- **`describe('a checkout that cannot keep its order')`** — covers refused-reserve scenarios (no order written, no order-number burned) and related cleanup. *Truncated in source; additional sub-suites (expiry sweep, payment settlement) are implied by the file header.*
- **`withoutWindow(body)`** — helper that wraps a test body with `NODE_RESERVATION_TTL_MINUTES=0` via `withEnvironment`, making any reservation immediately stale for expiry-sweep cases. Scoped per-test so other cases see the real TTL.
- **`beforeEach`** — calls `resetDomainEvents()` and `registerCheckoutModules([paymentsModule])` so cross-module event subscriptions (notably orders → `RESERVATION_EXPIRED`) are live.
- **`countersOf(product._id)`** (from `@modules/products/tests/factories`) — the universal assertion helper; returns `{ onHand, reserved, available }` and is checked together to prevent a non-reserving implementation from passing.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/cart/services/index.ts` | `cartService` is the primary subject — `cartItemAddById`, `orderConfirm`, `cartGetForBadge` are exercised. |
| `src/modules/cart/repository.ts` | `cartRepository.setShippingMethod` prepares the cart before `orderConfirm`. |
| `src/modules/products/tests/factories` | `createProduct` seeds inventory; `countersOf` reads back the three counters for assertions. |
| `src/modules/addresses/tests/factories` | `giveAddress` satisfies the checkout precondition (shipping address). |
| `src/modules/orders/tests/factories` | `orderRepository` is spied on (`create`, `incrementOrderNumberCounter`) to prove a refused reserve writes nothing. |
| `src/modules/payments/module.ts` | Registered in `beforeEach` so payment-related event handlers are subscribed. |
| `src/kernel/events.ts` | `resetDomainEvents` clears the in-memory event bus between tests. |
| `src/kernel/outbox.ts` | `outboxEventModel` / `settleOutboxNudges` imported (used in truncated portion for outbox assertions). |
| `src/infrastructure/adapters/logger.ts` | `logger` imported (likely for log assertions in truncated cases). |
| `src/modules/inventory/index.ts` | `inventoryService` imported (used in truncated expiry/release cases). |

## Notes

- **Real Mongo, not mocks.** `setupTestDb()` provisions a dedicated database; the file's header explicitly states the guarantees are conditional writes a mock cannot show.
- **Error shape is intentionally opaque to the customer.** Refusal details include `requested` and `availability` but *not* the remaining stock count. The race-condition test uses `toEqual` (not `toMatchObject`) on the refusal `details` to catch any extra field leaking inventory.
- **`afterEach` in the second describe** calls `jest.restoreAllMocks()` because Jest's `clearMocks` empties the call log but leaves forced-failure implementations in place.
- **`withoutWindow` is scoped, not global.** The TTL is read lazily on each reserve call, so setting it to zero globally would expire reservations mid-run for every other test.
- **The concurrent-race test** (`two checkouts cannot share the last unit`) is the canonical proof that the conditional write — not the pre-flight read — is the source of truth; both pre-flights see the unit as available.
