---
source: src/modules/delivery/services/act.ts
sha256: 3184b497e1cb931194427dc57a87a8db62104a2d5fd9ceef6d93d5c440788ce3
generated_at: 2026-10-29T03:37:15.978950+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/act.ts

## Purpose

Defines the transactional execution boundary for delivery fulfillment acts. Each act (ship, deliver, fulfil, hold, release, cancel-remainder) must write the fulfillment order, the parent order's summary, any status transition, and outbox events atomically. This module provides the transaction wrapper, the refusal mechanism that aborts the transaction cleanly, and a shared read helper so sibling services don't each re-implement the "load the two documents in-session or 404" step.

## Key elements

- **`ActRefusal`** (class) — Error subclass carrying a pre-built `ResponseReject`. Thrown inside a transaction to abort it; caught by `runAct` and returned to the caller as the refusal outcome.
- **`refuse(status, code, messageKey)`** — Throws an `ActRefusal` with a 409/422 response. The always-throwing `never` return type makes control flow explicit at call sites.
- **`refuseMissing(messageKey)`** — Convenience wrapper for the common 404 case.
- **`ActResult<T>`** (type) — Discriminated union: `{ refused: false; value: T }` or `{ refused: true; reject: ResponseReject }`. The single shape every act handler returns to the HTTP layer.
- **`runAct<T>(work)`** — Wraps `work(session)` in `withTransaction`. On commit, calls `nudgeOutbox()` so the relay picks up the newly visible events. Catches `ActRefusal` and maps it to the `refused: true` branch; re-throws any other error.
- **`readWithOrder(fulfillmentOrderId, session)`** — Loads the fulfillment order and its parent order within the act's session. Refuses with 404 if either is missing. This is the canonical in-act read; sibling services call it instead of issuing their own pre-transaction reads.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — `withTransaction` provides the MongoDB session/transaction lifecycle that `runAct` wraps.
- **`src/kernel/outbox.ts`** — `nudgeOutbox` is called after a successful commit to wake the outbox relay, which only sees the events post-commit.
- **`src/infrastructure/http/response.ts`** — `generateReject` and `ResponseReject` are used to build the structured refusal payloads carried by `ActRefusal`.
- **`src/infrastructure/i18n/index.ts`** — `t` translates the message keys passed to `refuse` / `refuseMissing` into client-facing strings.
- **`src/modules/delivery/repository.ts`** — `fulfillmentOrderRepository.findInSession` is the sole way `readWithOrder` fetches the fulfillment order, keeping the read inside the act's transaction.
- **`src/modules/delivery/model.ts`** — `FulfillmentOrderDocument` is the type returned by `readWithOrder` and consumed by sibling acts.
- **`src/modules/delivery/services/{holds,deliver,fulfill,cancel-remainder,found,ensure,cut}.ts`** — Sibling act services import `runAct`, `refuse`, `refuseMissing`, `ActResult`, and `readWithOrder` from this module; they provide the `work` callback and rely on this file for transactional semantics.

## Notes

- Refusals are intentionally decided *before* the first write, from the same in-session snapshot the writes will land in. This means a 409 or 422 is guaranteed to reflect the state the transaction actually sees, not a stale pre-transaction read.
- `nudgeOutbox` runs in the `.then` after `withTransaction` resolves — i.e., after commit. Calling it earlier would race the relay against uncommitted writes.
- Non-`ActRefusal` errors (e.g., a driver-level duplicate-key) are re-thrown, not swallowed. They bubble up as unhandled errors for the global error middleware; they do not produce an `ActResult`.
- `readWithOrder` is the single place a fulfillment-order-keyed act loads its parent order. Sibling services should not issue a separate `orderService` read outside the act, or they risk acting on a snapshot the transaction will not see.
