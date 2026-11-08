---
source: src/modules/addresses/tests/factories.ts
sha256: 4d5cb0eb1b11e3bac2f46aef20dabbaab2414ca2c2b59f7fcdad61538058042f
generated_at: 2026-11-08T04:57:07.201011+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/factories.ts

## Purpose

Test-helper module that provisions a default address-book entry for an account. It exists so that cart/checkout and user tests, which exercise database-backed flows, can give an account a valid billing address in one call instead of repeating inline `addressService.create` boilerplate.

## Key elements

- **`giveAddress(userId: string): Promise<void>`** — Calls `addressService.create` with a fixed Italian address (label `home`, name `Ada Lovelace`, city `Modena`) for the given `userId`. Resolves once the entry is persisted; no return value beyond the saved row.

## Relationships

- **`src/modules/addresses/service.ts`** — Imports `addressService`, the production service used to persist the address. This is the only runtime dependency.
- **Cart & account integration/contract tests** (e.g. `cart/tests/integration/checkout-*.test.ts`, `cart/tests/integration/stock.test.ts`, `account/tests/contract/shop.contract.test.ts`) — Consuming sides that call `giveAddress` before simulating checkout or account operations that require a billing address on the account.
- **`src/modules/users/tests/integration/minimise.test.ts`** — Also a consumer that needs a populated address book for its assertions.

## Notes

- The address data is hardcoded (single entry, Italian address). Do not expect locale or label variation; it is intentionally minimal.
- The file lives under `tests/` but is *not* a test itself—it is a shared factory consumed by tests in sibling modules (cart, account, users).
- The JSDoc explicitly states the motivation: without this, any test that places a checkout order for a fresh account will fail with `CART_BILLING_ADDRESS_REQUIRED`, obscuring the behavior under test.
