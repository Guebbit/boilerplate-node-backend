# src/modules/inventory/index.ts

## Purpose

Public barrel for the inventory module. It is the **only** surface sibling modules may import (enforced by lint), and it exposes a deliberately minimal API: one service handle, one pure availability function, and one event constant. Repositories, models, and counter primitives are intentionally absent so that no external module can mutate a stock number directly.

## Key elements

- **`inventoryService`** (from `./service`) — the single entry point sibling modules call to request a stock transition by name; returns a boolean.
- **`availabilityOf`** (from `./domain`) — pure function computing `onHand − reserved`, clamped at zero. The one sanctioned exception to the "never compute across the boundary" rule; anything that renders or checks availability should use this rather than subtracting locally.
- **`RESERVATION_EXPIRED`** (from `./events`) — event constant. Importing the barrel is also what installs the event payload declaration for consumers.
- **Not exported:** `StockMovementReason`, `StockLine`, repositories, models, and all counter primitives. `StockMovementReason` has a default in `releaseForOrder`; `StockLine` is a wire shape covered by generated contract types; `InventoryLevel` lives in `@types` and is imported by `service.ts` directly.

## Relationships

- **`./service`** (`src/modules/inventory/service.ts`) — provides `inventoryService`; also imports `InventoryLevel` from the shared `@types` package.
- **`./domain`** (`src/modules/inventory/domain/index.ts`) — provides `availabilityOf`.
- **`./events`** (`src/modules/inventory/events.ts`) — provides `RESERVATION_EXPIRED` and its payload declaration.
- **`src/modules/cart/…`** (checkout, domain tests) — the cart domain tier cannot import a sibling at all (eslint rule), so it keeps a local copy of the availability formula; its tests compare that copy against this export, which is why the function must remain importable at the barrel level.
- **`src/modules/orders/…`, `src/modules/payments/service.ts`** — sibling consumers that reach the barrel to request stock transitions; they never touch counters directly.

## Notes

- A barrel export line is treated as a **stability promise**. `tests/cross-cutting/published-language.test.ts` actively verifies that `StockMovementReason` and `StockLine` are *not* re-exported; adding them would be a public-API change.
- `availabilityOf` is the sole case where a consumer may *compute* across the boundary. The guard is that it is pure over plain data, not a handle into the counters.
- The file's own doc block is the canonical statement of the module's boundary contract; lint, not runtime checks, enforces it for external callers.
