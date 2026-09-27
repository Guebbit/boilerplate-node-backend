---
source: src/modules/payments/model.ts
sha256: 6c2521d76bf262017db4ab6a4787983e29adb0049fa3dd457909569222c28ec7
generated_at: 2026-09-27T15:23:35.690146+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/model.ts

## Purpose

Defines the Mongoose schema, model, and serialization contract for the `Payment` collection (one document per order) and the `PaymentWebhookEvent` idempotency ledger. It is the single source of truth for the payment document's shape, status vocabulary, and wire-level visibility rules, sitting below all services and the repository so neither layer can import the other in a cycle.

## Key elements

- **`PaymentDocument`** — Interface for the persisted payment record. Carries `orderId` (unique), `userId` (optional; unset on erasure), frozen `amount`/`currency`, `status` (provider-facing lifecycle from `PaymentStatus`), `provider`, optional `providerRef`, `cardLast4`, `method`, offline-only fields (`reference`, `receivedAt`, `refundedByHand`), and the crash-recovery field `pendingEffects`.
- **`PaymentEffect`** — Union type (`'commit'`) enumerating the effects a `succeeded` write may still owe.
- **`PaymentModel`** — Mongoose `Model<PaymentDocument>` type alias.
- **`paymentSchema`** — Mongoose schema with a composite index `{ pendingEffects: 1, updatedAt: 1 }` to back the effects-retry sweep. `providerRef` is `unique` + `sparse` so manual payments (no provider intent) don't collide on `null`.
- **`applyPaymentTransform`** — Serialization function (built via `applySerialization`) that maps `_id`→`id`, drops `__v`, and omits `providerRef` and `pendingEffects` from wire output.
- **`paymentModel`** — Registered Mongoose model `'Payment'`.
- **`CONFIRMABLE_PAYMENT_STATUSES`** — `readonly PaymentStatus[]` listing `requires_confirmation` and `declined`; used by both the confirm endpoint guard and the repository's conditional upsert `$in` filter.
- **`PaymentWebhookEventDocument`** / **`paymentWebhookEventSchema`** / **`paymentWebhookEventModel`** — Idempotency ledger: one row per provider event id, enforced by a `unique` index (insert-or-reject replaces a racy read-then-write). `receivedAt` carries a 30-day TTL so the collection self-cleans.

## Relationships

- **`src/types/index.ts`** — Imports `PaymentStatus` and `PaymentMethod` enums used in schema `enum` constraints and the `PaymentDocument` interface.
- **`src/infrastructure/persistence/serialize.ts`** — Imports `applySerialization` to construct `applyPaymentTransform`.
- **`src/modules/payments/repository.ts`** — Consumes `paymentModel`, `paymentWebhookEventModel`, and `CONFIRMABLE_PAYMENT_STATUSES` (as the `$in` array for conditional status writes and the confirm-path guard).
- **`src/modules/payments/services/settlement.ts`** — Writes `status → 'succeeded'` and `pendingEffects` in the same atomic write; clears `pendingEffects` once the effect completes.
- **`src/modules/payments/services/effects.ts`** — Scans `pendingEffects` (via the composite index) to retry or drop owed effects on a schedule.
- **`src/modules/payments/services/refunds.ts`** — Transitions status to `refunded`; sets `refundedByHand` on manual-provider refunds.
- **`src/modules/payments/services/retention.ts`** — Unsets `userId` on erasure (document is preserved, not deleted).
- **`src/modules/payments/services/offline.ts`** — Populates `reference`, `receivedAt`, and `method` for hand-recorded payments.
- **`src/modules/payments/services/view.ts`** — Reads payment documents for API projection; relies on `applyPaymentTransform` for output shape.
- **`src/modules/payments/services/intent.ts`** — Creates/updates payment documents through the intent flow; sets `providerRef` once the provider responds.
- **`src/modules/payments/index.ts`** — Barrel re-export of this module's public API.
- **`src/modules/payments/tests/unit/schema-contract.test.ts`** — Asserts the schema's fields and constraints match the published API contract.
- **`src/modules/payments/tests/unit/refunds.test.ts`** — Exercises refund transitions against the schema's status enum and `refundedByHand` flag.
- **`src/modules/payments/tests/integration/retention.test.ts`** — Verifies the unset-not-delete erasure path on `userId`.
- **`scenarios/flows/backdate.ts`** — Test-scenario helper that seeds payment documents through the model.

## Notes

- **One payment per order is enforced by the DB, not application logic.** The `unique` index on `orderId` means a retry after a decline re-confirms the same document; no application-level check can override this.
- **`providerRef` is intentionally sparse-unique.** Without `sparse: true`, every manual payment (which has no provider intent) would collide on a `null` unique value.
- **`CONFIRMABLE_PAYMENT_STATUSES` is an array, not a `Set`.** It is read both as a membership test and as the `$in` operand in conditional MongoDB writes; a `Set` would require re-spreading for the second use.
- **`pendingEffects` is written atomically with the status change to `succeeded`.** A crash between the status write and the effect execution leaves a durable marker; `effects.ts`'s sweep is the only consumer that retries or clears it.
- **Webhook idempotency relies on insert-or-reject, not read-then-write.** The `unique` index on `eventId` makes the claim race-safe; a 200 response is only sent after a successful insert, so concurrent duplicate deliveries cannot both pass.
- **`userId` is nullable by design.** Erasure unsets the field rather than deleting the payment row, matching the same convention used on `orders.userId`.
