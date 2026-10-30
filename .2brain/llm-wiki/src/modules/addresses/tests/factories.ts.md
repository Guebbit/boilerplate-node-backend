---
source: src/modules/addresses/tests/factories.ts
sha256: 4d5cb0eb1b11e3bac2f46aef20dabbaab2414ca2c2b59f7fcdad61538058042f
generated_at: 2026-10-29T03:10:14.420759+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/factories.ts

## Purpose

Test-helper module that seeds a single default address into an account's address book so that checkout-related tests in other modules don't fail on the `CART_BILLING_ADDRESS_REQUIRED` guard. It exists to keep those tests focused on their actual subject rather than on missing fixture data.

## Key elements

- **`giveAddress(userId: string): Promise<void>`** — Creates one address-book entry (label `"home"`, fixed persona "Ada Lovelace", Modena IT) via `addressService.create` and returns once the write is persisted. No further assertions or return value; callers `await` it for sequencing only.

## Relationships

- **`src/modules/addresses/service.ts`** — Imports and calls `addressService.create` to persist the entry. This is the only production-code dependency.
- **Cart integration/contract tests** (`checkout-expected-total`, `checkout-interleavings`, `line-availability`, `merge`, `preorder`, `product-removal-protects-orders`, `stock-flag`, `stock`, `totals`, `backorder`, `api.contract.test`, `shop.contract.test`, `minimise.test`) — Consumer side: these tests call `giveAddress` in their setup to guarantee the account under test has a billing address before asserting on order, stock, or cart behaviour.

## Notes

- The address data is hard-coded; if a test specifically needs to assert on address fields, it must create its own entry rather than relying on this helper.
- Because `create` makes the new entry the account's default, calling it multiple times for the same user will stack defaults — tests that need a specific "no default" or "multiple addresses" state should not use this helper.
- The function swallows the created record (`.then(() => undefined)`); if a later test step needs the address id, it must query the address book independently.
