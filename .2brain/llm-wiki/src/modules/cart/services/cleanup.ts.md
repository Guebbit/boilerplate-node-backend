---
source: src/modules/cart/services/cleanup.ts
sha256: fe8611ee0bd1f1901419d914a340185590e132ac02a77575a84c209dfe36db61
generated_at: 2026-09-23T18:32:19.246288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/cleanup.ts

## Purpose

Domain-event handler entry points that other modules invoke when a user or product is permanently deleted. A cart holds references to a user and a product it does not own; without these handlers, stale references would remain after either entity disappears.

## Key elements

- **`cartDeleteByUserId(userId: string): Promise<void>`** — Deletes a user's cart document entirely (hard account deletion). Delegates to `cartRepository.deleteByUserId`.
- **`productRemoveFromCartsById(id: string): Promise<void>`** — Removes a single product from every user's cart. Delegates to `cartRepository.removeProductFromAll`, then maps the result to `undefined` to normalize the return type to `Promise<void>`.

## Relationships

- **`src/modules/cart/module.ts`** — Wires both exports as domain-event handlers on the deletion events that fire when a user or product is removed.
- **`src/modules/cart/repository.ts`** — Sole data-access dependency; each handler delegates its work to a `cartRepository` method.
- **`src/modules/cart/services/index.ts`** — Barrel that re-exports these functions for the module's public API.
- **`src/modules/cart/tests/integration/service.test.ts`** — Integration tests exercising both cleanup handlers.

## Notes

- Neither function is reachable from a cart HTTP route. They exist exclusively as event handlers, so a **rejected promise** (not an HTTP error envelope) is the intended failure signal — `emitDomainEvent` in `kernel/events.ts` inspects the rejection to log handler failures.
- `cartDeleteByUserId` is distinct from `cartRemove` (which empties a cart the user still owns). Do not conflate them.
- `productRemoveFromCartsById` uses `.then(() => undefined)` rather than returning the repository promise directly, ensuring the public signature is always `Promise<void>` regardless of what `removeProductFromAll` resolves with.
