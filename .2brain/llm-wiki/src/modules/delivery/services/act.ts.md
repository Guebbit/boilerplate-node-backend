---
source: src/modules/delivery/services/act.ts
sha256: a88b7a1fc2695f8c93b56a2017354ce2b2fca5b04c52a19ff1dcf36b36f268fa
generated_at: 2026-11-08T05:33:13.261396+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/act.ts

## Purpose

Provides the transactional envelope for every delivery fulfillment act (ship, deliver, fulfill, hold, release, remainder-cancel). It guarantees that the fulfillment order write, the parent order's status/summary update, and the outbox events commit atomically, and gives the act a single mechanism (`ActRefusal`) to abort the transaction and surface a structured `ResponseReject` at the HTTP boundary.

## Key elements

- **`ActRefusal`** – Error subclass carrying a `ResponseReject`. Throwing it inside a transaction both aborts the transaction and encodes the HTTP response the door should return.
- **`refuse(status, code, messageKey)`** – Convenience that throws `ActRefusal` with a structured reject (status, error code, translated message).
- **`refuseMissing(messageKey)`** – Shortcut for a 404 refusal.
- **`ActResult<T>`** – Discriminated union: `{ refused: false; value }` on success, `{ refused: true; reject }` on refusal.
- **`runAct(work)`** – Runs `work(session)` inside `withTransaction`. On commit, nudges the outbox relay and resolves with the produced value. On `ActRefusal`, resolves (not rejects) with the refusal. Any other error re-throws.
- **`readWithOrder(fulfillmentOrderId, session)`** – Reads the fulfillment order and its parent order within the act's snapshot (same transaction session). Refuses 404 if either is missing. Eliminates a redundant door-level read.

## Relationships

- **`@kernel/outbox`** – `runAct` calls `nudgeOutbox()` after a successful commit so the relay picks up the events just written.
- **`@infrastructure/runtime/database`** – `runAct` delegates transaction management to `withTransaction`.
- **`@infrastructure/http/response`** – `refuse` / `refuseMissing` build the `ResponseReject` payload via `generateReject`.
- **`@infrastructure/i18n`** – Refusal messages are translated with `t(messageKey)` before being embedded in the reject.
- **`../repository`** – `readWithOrder` calls `fulfillmentOrderRepository.findInSession` to load the fulfillment order inside the act's session.
- **`../model`** – Consumes the `FulfillmentOrderDocument` type as the shape `readWithOrder` returns.
- **`@modules/orders`** – `readWithOrder` calls `orderService.readOrder` to fetch the parent order in the same session.
- **Sibling delivery services** (`cut`, `deliver`, `fulfill`, `holds`, `cancel-remainder`, `ensure`, `found`) – Depend *on* this module: they import `runAct`, `refuse`/`refuseMissing`, and `readWithOrder` to structure their own transactional work. This file imports none of them.

## Notes

- `runAct` **resolves** (not rejects) on refusal. Callers must check `result.refused` rather than wrapping in a try/catch for business errors; only infrastructure errors propagate as thrown exceptions.
- Refusals are decided *before* any write lands in the snapshot, so a refused act leaves zero partial writes.
- `refuse` accepts only a closed set of statuses (`404 | 409 | 422`); other codes require constructing an `ActRefusal` directly.
- The `session` parameter threaded through `readWithOrder` ensures reads and subsequent writes see the same snapshot — do not issue a separate read outside the act.
