# src/modules/inventory/index.ts

## Purpose

Public barrel for the Inventory module. It is the **only** import surface allowed for sibling modules (lint forbids reaching `./service` or `./domain` directly). Its job is to expose a minimal, transition-by-name API while keeping repositories, models, and all counter internals private.

## Key elements

- **`inventoryService`** (re-export from `./service`) — the service object sibling modules call to request stock transitions by name. Callers receive a boolean; internal counter costs are hidden.
- **`availabilityOf`** (re-export from `./domain`) — pure function: `onHand − reserved`, clamped at zero. The single "compute" escape hatch; safe because it operates on plain data, not live counters.
- **`RESERVATION_EXPIRED`** (re-export from `./events`) — event payload declaration. Importing the barrel is what installs the type for this event.
- **Deliberately omitted**: repositories, model types, counter primitives, `StockMovementReason`, `StockLine`. Exposing any of these would leak the mutability the module is designed to hide.

## Relationships

- **`src/modules/inventory/service.ts`** — source of `inventoryService`; the file re-exports it without wrapping.
- **`src/modules/inventory/domain/index.ts`** — source of `availabilityOf`.
- **`src/modules/inventory/events.ts`** — source of `RESERVATION_EXPIRED`.
- **`src/modules/cart/…`** (checkout, stock tests, domain-rules tests) — `cart` is the primary sibling consumer; its domain tier maintains a **local copy** of `availabilityOf` (domain tier cannot import a sibling) and its tests verify that copy matches this export.
- **`src/modules/orders/…`** (module, service, integration tests) — sibling consumer; imports `inventoryService` through this barrel to request reservation/fulfillment transitions.
- **`src/modules/payments/service.ts`** — sibling consumer in the payment flow.
- **`src/modules/inventory/tests/integration/ledger.property.test.ts`** — property-based tests that exercise the service behind this barrel.

## Notes

- Lint rule: any import that bypasses this barrel (e.g. `import { … } from '…/inventory/service'`) is a hard error. Add a new sibling-facing symbol **here** first.
- `availabilityOf` exists in two places (here and in `cart`'s domain tier). If you change the formula, update both and keep the cross-test green.
- Adding a new type export is a contract: the barrel comment states a "barrel line is a promise." Don't add shapes until a caller actually needs them.
