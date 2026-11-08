---
source: src/modules/delivery/services/notice.ts
sha256: 683faff8fcc187975ccebdf93310fbcb4b782ddea3644d54df41376ef2c5a6b2
generated_at: 2026-11-08T05:36:51.229445+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/notice.ts

## Purpose

The single place where a preorder buyer's notice is built and recorded when their delivery date moves (admin edit) or will be missed (daily sweep). It writes the fulfillment order's new state and the `FulfillmentOrderDelayed` event in the caller's transaction; the actual email is dispatched by the announce layer after commit.

## Key elements

- **`NoticeInput`** (exported interface) — Caller's decision: `reason` (`'moved'` | `'due'`) and `expectedAt` (`Date` to set, `null` to clear, `undefined` to leave unchanged).
- **`SentNotice`** (exported interface) — Return value after a successful write; carries the updated `FulfillmentOrderDocument`.
- **`payloadOf`** (private) — Assembles the `FulfillmentOrderDelayed` event payload from the fulfillment order, order, input, and the buyer's prior `promisedAt`. Omits optional fields (`userId`, `promisedAt`, `shipCountry`, `expectedAt`) when they are absent.
- **`recordNotice`** (exported, main entry point) — Inside the caller's `ClientSession`: reads the order, computes the post-notice promise, builds a `FulfillmentOrderPatch` (stamps `lastNoticeAt`, sets/unsets `expectedAt`/`promisedAt`, records `dueNoticeFor` for sweep dedupe), claims the write via optimistic revision check, then calls `announceDelayed`. Returns `undefined` if the order is gone or the revision is stale.

## Relationships

- **`../domain` (index)** — imports `promisedAfterNotice` to compute what `promisedAt` should become after the notice (defined in `domain/preorder.ts`).
- **`../repository`** — calls `fulfillmentOrderRepository.claim` for the revision-guarded write; uses the `FulfillmentOrderPatch` type.
- **`../model`** — reads/writes `FulfillmentOrderDocument` shape (fields like `lines`, `agreedAt`, `expectedAt`, `promisedAt`, `revision`).
- **`../events`** — constructs a `FulfillmentOrderDelayed` event via `payloadOf`.
- **`./announce`** — delegates the post-commit email to `announceDelayed`.
- **`@modules/orders` (index)** — uses `orderService.readOrder` and `buyerIdOf`; the `OrderDocument` type flows through `payloadOf`.
- **`./preorder-sweep.ts`** (caller) — invokes `recordNotice` with `reason: 'due'` when the daily sweep finds a date that will be missed.
- **`./slip.ts`** (caller) — invokes `recordNotice` with `reason: 'moved'` when an admin changes the release date.

## Notes

- **Optimistic concurrency:** the write is guarded by `fulfillmentOrder.revision`. If a ship or allocation commits first, `claim` fails and the notice is silently dropped — no retry, no error thrown to the caller.
- **Sweep dedupe:** `dueNoticeFor` is set to the *current* `expectedAt` only when `reason === 'due'` and `expectedAt` is present. A subsequently moved date produces a fresh notice because `dueNoticeFor` no longer matches.
- **Date clearing:** `expectedAt: null` in `NoticeInput` triggers `unset` of both `expectedAt` and (conditionally) `promisedAt`. A cleared date leaves no promise, so a later redelivery finds nothing to move.
- **No buyer interaction:** this is a one-way notification. The code does not prompt or block on the buyer; "silence keeps them waiting."
- **Email is not sent here:** `announceDelayed` is called inside the transaction but is responsible for scheduling the send after commit (see `announce.ts`).
