---
source: src/modules/cart/tests/integration/merge.test.ts
sha256: bb389ca9d29a16084a1c40897c2174ff21a527bbd30cd97a5e6e59ae20e328be
generated_at: 2026-11-14T19:34:37.581923+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/merge.test.ts

## Purpose

Integration test suite for the guest-cart-into-signed-in-cart merge operation. It verifies the per-line contract (quantities sum, ceiling caps, stock flags without mutation, one bad line never strands the rest) and the `CART_MERGE_REFUSED` event announcement, using a real database and live cross-module services.

## Key elements

- **`quantities(userId)`** – Reads the persisted cart back via `cartService.get` and returns a `productId → quantity` map. Used in every assertion to confirm actual state rather than trusting the response shape.
- **`lineOf(product, quantity)`** – Builds a single guest line object (`{ productId, quantity }`) from a product document.
- **`announced`** (jest.fn) – Spy registered on the `CART_MERGE_REFUSED` domain event; verifies the notification contract for lines that could not be added at all.
- **`describe('answers one result per submitted line')`** – Covers: new line, summed line, capped line (999), order preservation, duplicate-product-in-one-request, and the returned `cart` snapshot alongside `lines`.
- **`describe('stock flags a line and never changes it')`** – Covers: insufficient stock (flag only), exact-fit (no flag), summed-vs-stock, never-lowering an existing over-stock line, sold-out product (`out_of_stock`), cap-plus-short (keeps `capped` reason), and another shopper's checkout hold reducing available stock.

## Relationships

- **`cartService`** (`src/modules/cart/services/index.ts`) – Primary subject under test (`merge`, `get`, `addItemById`).
- **`cartRepository`** (`src/modules/cart/repository.ts`) – Used to set shipping method on another buyer's cart, simulating a checkout hold.
- **`CART_MERGE_REFUSED`** (`src/modules/cart/events.ts`) – Domain event spied on to verify the notification contract.
- **`onDomainEvent` / `resetDomainEvents`** (`src/kernel/events.ts`) – Register and reset the event spy between tests.
- **`overrideEnvironment` / `resetEnvironmentOverrides`** (`src/infrastructure/config/store.ts`) – Force `NODE_CART_LINE_MAX_QUANTITY=999` so ceiling tests are isolated from shop defaults.
- **`inventoryService`** (`src/modules/inventory/index.ts` / `src/modules/inventory/services/index.ts`) – Calls `adjust` to simulate a stocktake reducing on-hand quantity mid-test.
- **`productService`** (`src/modules/products/index.ts` / `src/modules/products/services/index.ts`) – Calls `removeById` to create a "removed" product scenario.
- **`createProduct`** (`src/modules/products/tests/factories.ts`) – Factory for products with controlled `onHand` values.
- **`createUser`** (`src/modules/users/tests/factories.ts`) – Factory for test users.
- **`giveAddress`** (`src/modules/addresses/tests/factories.ts`) – Attaches a shipping address to a buyer so a checkout hold can be simulated.
- **`paymentsModule`** (`src/modules/payments/module.ts`) – Registered via `registerCheckoutModules` for the checkout-hold scenarios.
- **`testCallerContext`** (`tests/support/callers.ts`) – Provides the authenticated caller context passed to service calls.

## Notes

- `beforeEach` sets `NODE_CART_LINE_MAX_QUANTITY` to **999**; without this the shop's lower default would mask the cap behaviour. `afterEach` resets all overrides.
- Every assertion about final state calls `quantities(userId)` (a fresh `cartService.get`) rather than inspecting the merge response's `resulting` field—deliberate "never trust the answer to describe itself" convention stated in the file header.
- `lineOf` always stringifies `product._id`; forgetting this mismatch is a common source of test failures.
- The file is **truncated** in the provided content; additional `describe` blocks (likely covering refused lines and the `notifications` contract in more depth) exist beyond what is shown here.
- `setupTestDb()` is called at module scope—this is a true integration test against a real database, not a unit test with mocked repositories.
