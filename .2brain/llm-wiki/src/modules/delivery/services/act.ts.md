---
source: src/modules/delivery/services/act.ts
sha256: 89d8781ec9ec7de726f40f60ebafda6482eb41a8a7d26067eece514b2c422008
generated_at: 2026-10-14T15:25:58.829327+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/act.ts

## Purpose

Provides the transactional boundary for every delivery fulfillment act (ship, deliver, fulfil, hold, release, cancel-remainder). It guarantees that an act's writes—fulfillment order, shipment, order summary, status transition, and outbox events—commit atomically or not at all, and converts in-transaction refusals into the standard HTTP reject shape.

## Key elements

- **`ActRefusal`** – Error subclass carrying a `ResponseReject`. Thrown inside a transaction to signal a business-level refusal; the transaction aborts and the reject is surfaced to the caller.
- **`refuse(status, code, messageKey)`** – Convenience that throws `ActRefusal` with a 404/409/422 status and a single error-code detail.
- **`refuseMissing(messageKey)`** – Shortcut that throws a 404 `ActRefusal`.
- **`ActResult<T>`** – Discriminated union: `{ refused: false; value: T }` or `{ refused: true; reject: ResponseReject }`.
- **`runAct<T>(work)`** – Executes `work(session)` inside `withTransaction`. On success, calls `nudgeOutbox()` and resolves with the value. On `ActRefusal`, resolves with the reject. Any other error is re-thrown.

## Relationships

- **`src/kernel/outbox.ts`** – `runAct` calls `nudgeOutbox()` after a successful commit so the relay picks up events written within the transaction.
- **`src/infrastructure/runtime/database.ts`** – Provides `withTransaction`, the Mongoose session wrapper that `runAct` delegates to.
- **`src/infrastructure/http/response.ts`** – `generateReject` and the `ResponseReject` type are used to shape refusals.
- **`src/infrastructure/i18n/index.ts`** – `t` is called by `refuse`/`refuseMissing` to resolve the user-facing message.
- **Sister services** (`deliver.ts`, `fulfill.ts`, `hold.ts`, `cut.ts`, `confirm-wait.ts`, `cancel-remainder.ts`, `override-sync.ts`, `preorder-sweep.ts`) – Each is a consumer: they build a `work` closure, call `runAct`, and use `refuse`/`refuseMissing` for in-transaction business checks.
- **`src/modules/delivery/services/index.ts`** – Barrel that re-exports the delivery service surface; `act.ts` exports are available to callers through it.

## Notes

- `runAct` **resolves** on refusal (it does not reject). Callers must check the `refused` discriminant rather than relying on `try/catch` for business errors.
- Only `ActRefusal` is caught; unexpected errors (DB failures, programming bugs) propagate as thrown errors—use a standard try/catch at the route/handler level for those.
- The `nudgeOutbox()` call happens *after* `withTransaction` resolves, ensuring the relay only sees events once they are durably committed.
