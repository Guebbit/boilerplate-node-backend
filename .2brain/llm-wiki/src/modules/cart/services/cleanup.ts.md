---
source: src/modules/cart/services/cleanup.ts
sha256: d3409986dd18f5cd9bdc3991bfa34f6ca5aa6f701e3c8cb6d5de034b7f06b1c4
generated_at: 2026-09-27T14:46:05.714503+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/cleanup.ts

## Purpose

Provides two cleanup entry points that **other** modules call when a user or a product is permanently deleted. A cart holds references to both a user and a product but owns neither, so without these calls stale cart data would linger. Neither function is reachable from a cart route; they exist purely as external hooks.

## Key elements

- **`cartDeleteByUserId(userId, session)`** — Deletes a user's cart outright (not an empty). Accepts a Mongoose `ClientSession` so the delete joins the caller's hard-delete transaction. A throw here **aborts** that transaction.
- **`productRemoveFromCartsById(id)`** — Removes a product from every user's cart. Returns a plain `Promise<void>` (strips the repository's result via `.then(() => undefined)`). A **rejected** promise is the signal `emitDomainEvent` reads to mark the handler as failed and log it.
- Both delegate to `cartRepository` (from `../repository`); this file adds no logic beyond forwarding.

## Relationships

- **`src/modules/cart/module.ts`** — Registers `cartDeleteByUserId` as the `personalData.erase` hook in the DDD-D6 manifest (synchronous transactional call) and registers `productRemoveFromCartsById` as a domain-event handler via `subscribe()`. The two therefore have fundamentally different failure semantics: abort vs. log-and-skip.
- **`src/modules/cart/repository.ts`** — Sole dependency; both functions are one-line wrappers over `cartRepository.deleteByUserId` and `cartRepository.removeProductFromAll`.
- **`src/modules/cart/services/index.ts`** — Barrel re-export; consumers import from the services index rather than this file directly.
- **`src/modules/cart/tests/integration/checkout-version.test.ts`** / **`service.test.ts`** — Integration tests that exercise these cleanup paths in context.

## Notes

- The two functions look similar but have **different failure contracts**: `cartDeleteByUserId` participates in the caller's transaction (throw = rollback), while `productRemoveFromCartsById` is a fire-and-forget domain-event handler (reject = log, no rollback). Do not treat them as interchangeable or add a shared error-wrapping helper.
- `cartDeleteByUserId` is **not** a domain event; it is a direct synchronous call made inside the caller's own `hardDelete` transaction. Mis-wiring it as a subscriber would silently change its atomicity guarantees.
- Neither function is exposed on any cart controller/route — importing them from cart route handlers is a misuse of the module boundary.
