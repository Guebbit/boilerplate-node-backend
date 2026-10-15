---
source: src/modules/payments/services/view.ts
sha256: e48967a5df6c8bd3eeb317f5383fb08593ba5880f8219775a90660a53171b5ea
generated_at: 2026-10-15T11:32:38.325948+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/view.ts

## Purpose
Read-side query service for the order page's payment panel. Given an order ID and an auth context, it fetches the associated payment, computes which `actions` (`pay`, `refund`) the caller may take, and returns a shaped `Payment` payload ready for the frontend.

## Key elements
- **`getForOrder(orderId, authContext?)`** – Looks up the payment via `paymentRepository.findByOrderId` (scoped by `callerScope`). If the payment is missing, returns a 404 reject. Otherwise fetches the order (solely to answer `isPayable`) and delegates action-computation to `withActions`.
- **`withActions(payment, order, authContext?)`** – Assembles the final `Payment` object: spreads `presentPayment` output, then attaches an `actions` object with `pay` and `refund` booleans. Calls `orderService.handlesMoneyOf` to gate the refund path.
- **`isPayerWithCheckout(payment, authContext?)`** – Private helper. Returns `true` only when the caller is the originating account *and* holds the `cart.self.checkout` ability. Excludes staff, other customers, and erased accounts.

## Relationships
- **`@modules/orders`** (`orderService`, `isPayable`, `OrderDocument`) – `getForOrder` fetches the order to evaluate `isPayable`; `withActions` calls `orderService.handlesMoneyOf` for the refund gate.
- **`../repository`** (`paymentRepository`) – Primary data access for the payment document.
- **`../presenter`** (`presentPayment`) – Serializes the raw `PaymentDocument` into the wire shape.
- **`../domain`** (`CONFIRMABLE_PAYMENT_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`) – Status constants that drive the `pay`/`refund` action checks.
- **`@kernel/permissions`** (`callerForSubject`) and **`@kernel/ability`** (`holdsKey`) – Permission/ability lookups for `cart.self.checkout` and `payments.any.update`.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` build the HTTP response envelopes.
- **`@infrastructure/i18n`** – `t()` localizes the 404 message.
- **`./scope`** (`callerScope`, `readsAllPayments`) – Resolves the repository query scope and presenter-level visibility from the auth context.
- **`./refunds`** (`remainingOf`) – Determines whether unrefunded balance exists for the `refund` action.
- **`services/index.ts`** – Re-exports the public functions from this module.

## Notes
- **`pay` deliberately excludes in-flight payments.** An in-flight payment's next transition is `sync` (webhook), not a second payment method; offering the card form again risks double-charge.
- **Refund key is intentionally narrow.** The check uses `payments.any.update` (the moderator's key). Asking for a broader permission would *hide* the action from a moderator who holds exactly that key.
- **`withActions` is async** because `orderService.handlesMoneyOf` performs an async ranking check (operator vs. buyer). Consumers must `await` it.
- The order is fetched inside `getForOrder` *only* to answer `isPayable`—the file's own comment calls this out as the mechanism that prevents the client from deriving payability from two separate fields.
