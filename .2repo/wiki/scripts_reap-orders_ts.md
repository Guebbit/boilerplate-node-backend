# scripts/reap-orders.ts

## Purpose

Periodic PII-scrubbing script (`npm run reap:orders`) that anonymizes order records whose retention window has expired. Unlike the sibling `reap-*` scripts, it **never deletes a row**—it replaces personal fields (email, shipping name/phone/street) with placeholders while preserving financial data (amounts, line items, dates, city, country). This is the "other half" of the erasure flow: the `USER_DELETED` listener in the orders module stamps `anonymizeAfter` when an account is deleted, and this script acts on that date later.

## Key elements

- **`main`** – async entry point; calls `start()` to open the DB connection, then delegates to `orderService.anonymizeDueOrders()`, resolving to `undefined`.
- **`void runScript(main, stopDatabase)`** – top-level invocation wrapped by the shared script runner, which handles `stopDatabase` cleanup and error signaling.
- **`orderService.anonymizeDueOrders()`** – (imported from `@modules/orders`) the actual query + update that sets PII columns to placeholders for rows past their `anonymizeAfter` date.

## Relationships

- **`db/run-script.ts`** – provides `runScript`, which wraps `main` with process-level error handling and ensures `stopDatabase` runs on exit/failure.
- **`src/infrastructure/runtime/database.ts`** – supplies `start()` (connection init) and `stopDatabase` (teardown); the script is the sole caller in this context.
- **`src/modules/orders/index.ts`** – barrel re-export of `orderService`; the script imports from here rather than reaching into the service file directly.
- **`src/modules/orders/service.ts`** – implements `anonymizeDueOrders()`; this file is the only consumer of that method.

## Notes

- **Scheduling:** must run on a cron cadance (same container as `reap-quarantine` / `reap-inactive-accounts`). It is *not* idempotent-on-boot; running it on every container start is an anti-pattern.
- **Legal framing:** the doc comment cites Art. 17(3)(b)/(e)—an order is treated as an invoice and must be kept whole; only the *person* is removed from it. This is why the script scrubs rather than deletes.
- **Counterpart logic:** the `USER_DELETED` event listener in `orders/module.ts` (not in this file) is what sets `userId = null` and stamps `anonymizeAfter`. Without that listener firing first, `anonymizeDueOrders()` has nothing to act on.
- **`main` return shape:** the explicit `.then(() => undefined)` keeps the resolved value `void` so the `runScript` wrapper can treat the promise uniformly regardless of what `anonymizeDueOrders` returns.
- **Ops reference:** see `docs/reference/ops.md` for cron configuration and rotation expectations.
