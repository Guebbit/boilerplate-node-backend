---
source: src/modules/cart/tests/integration/merge-atomic.test.ts
source_sha256: 2158ac49d79dce249a648161e3c8f37f6e61742f92d645eb6440fabe25a61975
context_sha256: 0d0c26baf411e559980a0a8827fa3ce52f4273a32ab5efa21efc540fc5097c09
generated_at: 2026-11-22T04:40:08.542510+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/merge-atomic.test.ts

## Purpose
Integration tests (real test DB via `setupTestDb`) asserting that a cart merge and a reorder commit all their lines in a single write, or none. This guarantees that a failed request leaves the cart unchanged (so a resend can't duplicate lines), that a cart modified mid-request is re-planned rather than overwritten, and that a failure in the "removed lines" notice cannot turn a successful merge into an error.

## Key elements
- **`jest.mock('@infrastructure/observability/analytics')`**: replaces `emitAnalyticsEvent` with a `jest.fn` wrapping the real one, because `jest.spyOn` cannot redefine the non-configurable CommonJS namespace property under the swc transform. Tests observe it via `observePort`.
- **`heldBy(userId)`**: helper returning the cart as `productId → quantity` (empty object when no cart exists).
- **`lineOf(product, quantity)`**: builds a guest merge line from a product document.
- **`describe('a merge is one write')`**:
  - One cart-model update call regardless of line count, with quantities summed.
  - A rejected repository write leaves the cart untouched and emits no analytics; a resend then lands each line once.
  - When no line can be added (removed product), no cart is created, no write is attempted, and nothing is emitted; the result line has `reason: 'removed'`, `resulting: 0`.
- **`describe('a cart that changes during a merge')`**:
  - A concurrent `addItemById` during the first write causes a re-plan; the result is `summed` and exactly one cart item-updated analytics event is emitted.
  - The same re-plan occurs when the cart did not exist at read time but was created meanwhile.
  - If the repository write always returns `null`, the merge throws `'exhausted retries'` and writes nothing.
- **`describe('the notice about removed lines')`**: if `productService.titlesOf` rejects, the `CART_MERGE_REFUSED` domain event is still emitted with `titles: {}`, the error is logged once, and the merge still writes the valid line.
- **`describe('a reorder is one write too')`**: `reorderIntoCart` leaves the cart unchanged on a write failure (returns `success: false`) and succeeds on retry with each line once. A successful reorder returns the cart the write produced.

## Relationships
- Exercises `cartService` (`merge`, `addItemById`, `reorderIntoCart`) from `src/modules/cart/services/index.ts`.
- Reads and spies on the cart repository (`src/modules/cart/repository.ts`) and the cart model (`src/modules/cart/model.ts`) to simulate write failures and concurrent changes, and to read back cart contents.
- Uses `productService` (`removeById`, `titlesOf`) from `src/modules/products` to remove products and simulate failures.
- Subscribes to `CART_MERGE_REFUSED` (from `src/modules/cart/events.ts`) through `onDomainEvent` / `resetDomainEvents` in `src/kernel/events.ts`.
- Asserts on the cart analytics event names from `src/modules/cart/analytics.ts`, via the mocked analytics port in `src/infrastructure/observability/analytics/index.ts`.
- Spies on the logger from `src/infrastructure/adapters/logger.ts`.
- Seeds data with the user, product and order factories (`src/modules/users/tests/factories.ts`, `src/modules/products/tests/factories.ts`, `src/modules/orders/tests/factories.ts`), and uses `testCallerContext` / `asCustomer` from `tests/support/callers.ts`.

## Notes
- Concurrency is simulated by wrapping the real repository write with `mockImplementationOnce`, which performs a competing `addItemById` before delegating to the real write.
- `afterEach` calls `jest.restoreAllMocks()`.
