---
source: src/modules/payments/model.ts
sha256: bb7186575851c14d4f23b8a34f40287fb48214779e727d3607c5faf1269f3f6f
generated_at: 2026-11-08T07:21:56.684758+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/model.ts

## Purpose

Defines the Mongoose schema and TypeScript document interfaces for the payment collection — one document per order (enforced by a unique index on `orderId`). It is the single source of truth for the payment's shape: status lifecycle, embedded refund and dispute sub-documents, and the serialization/typing contracts that every other file in the module reads from or writes to.

## Key elements

- **`RefundLine`** — minimal `{ productId, quantity }` pair identifying goods a refund pays back; plain IDs, no cross-module references.
- **`RefundRecord`** — one embedded sub-document per refund attempt. Carries amount, currency, status, idempotency key, retry metadata (`attempts`, `attemptedAt`, `nextAttemptAt`), settlement markers (`settledByHand`, `settledAt`), and reversal markers (`reversedAt`, `reversedAfterSettling`).
- **`DisputeRecord`** — one embedded sub-document per bank dispute, keyed by `disputeRef`. Holds provider-reported status, amount, evidence deadline, and an `observedAt` fence for out-of-order updates.
- **`RefundSettlement`** — narrow record of what a settle write records beyond status (provider ref, hand-settle flag, attempt fence, allowed source statuses via `from`).
- **`PaymentDocument`** — the full document interface: `orderId`, optional `userId`, amount/currency, `status`, `provider`, `providerRef`, method, transfer fields, `amountRefunded`, `refunds[]`, `disputes[]`, timestamps.
- **`PaymentModel`** — `Model<PaymentDocument>` alias; the type repository and services receive.
- **`refundSchema` / `disputeSchema`** — Mongoose `Schema` instances for the embedded sub-documents, using `moneyPath` for decimal money fields and enum constraints from the shared `@types` package.
- **Main payment schema** (truncated in view) — wires the above together, applies `moneyPlugin` and `applySerialization`, and declares the unique index on `orderId` and the unique index on `providerRef`.

## Relationships

- **`src/infrastructure/persistence/money-field.ts`** — provides `moneyPath` (schema-level decimal path builder) and `moneyPlugin` (document-level money helpers) used by every money field in this schema.
- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, which attaches the wire-serialization transforms to the document.
- **`src/modules/payments/repository.ts`** — the only file that issues Mongoose queries/mutations against the `PaymentModel` exported here; this file owns the schema, repository owns the reads/writes.
- **`src/modules/payments/presenter.ts`** — maps a `PaymentDocument` to the public wire shape; the "never published" and "staff only" annotations in this file define what presenter must strip.
- **`src/modules/payments/index.ts`** — module barrel; re-exports the model so services and external consumers import from the module root.
- **Services** (`intent`, `refund-settlement`, `disputes`, `effects`, `announce`, `external-refunds`, `list`, `notify`, `offline`) — each reads or writes specific fields defined here (e.g. `refund-settlement.ts` matches on `attemptedAt` and `idempotencyKey`; `disputes.ts` overwrites `DisputeRecord` entries keyed by `disputeRef`); they rely on this file's types for their input/output contracts.
- **`scenarios/flows/backdate.ts`** — constructs or seeds `PaymentDocument` instances for test/flow simulation.

## Notes

- **One payment per order is structural**, not just logical: the unique index on `orderId` means a retry after a decline re-confirms the same document.
- **`providerRef` is never published.** It is the provider-side handle for real money and is indexed/unique precisely because webhooks look up by it. All API endpoints use the document's own `_id`.
- **Several fields are explicitly "never published" or "staff only"** (`idempotencyKey`, `lines`, `shipping`, `providerRefundRef`, `failureReason`, `attempts`, `attemptedAt`, `nextAttemptAt`, `settledByHand`, entire `disputes` array, `providerRef`). The presenter is responsible for stripping them; the schema itself stores them.
- **`attemptedAt` is a fence token, not a timestamp of last activity.** A settle or fail write must match on it so a slow stale attempt cannot clobber a newer one.
- **`amountRefunded` increments the moment a refund is opened** (not when it settles), which is the guard against two racing partial refunds exceeding the original amount.
- **`userId` is unset (not deleted) on account erasure**, mirroring the `orders` convention. No PII beyond the ID is stored on the payment.
- **Embedded sub-documents use `_id: false` for `RefundLine`** but retain Mongoose-generated `_id` for `RefundRecord` and `DisputeRecord` (the latter also keyed by `disputeRef`).
- **`currency` is stored per-document** (not read from config at query time) because the default currency env var can change after the payment was made.
