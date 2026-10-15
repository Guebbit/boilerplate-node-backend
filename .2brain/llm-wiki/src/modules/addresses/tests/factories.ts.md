---
source: src/modules/addresses/tests/factories.ts
sha256: 70e02c6938b6fd6d0179976f3f4770f421f3ccdf08c495a339facd6407431f40
generated_at: 2026-10-15T10:19:14.177716+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/factories.ts

## Purpose

Provides a one-liner helper that seeds a test account with a default billing address, so that checkout and cart tests can focus on their actual subject (totals, stock, concurrency, etc.) instead of failing on the `CART_BILLING_ADDRESS_REQUIRED` guard.

## Key elements

- **`giveAddress(userId: string): Promise<void>`** — Calls `addressAdd` from the addresses service with a fixed Italian address (label "home", "Ada Lovelace", Modena IT) and resolves to `void`. After it resolves the account has exactly one address-book entry, which is its default.

## Relationships

- **`src/modules/addresses/service.ts`** — The sole import; `addressAdd` is the service function that persists the entry.
- **Cart / Users / Integration test files** (e.g. `src/modules/cart/tests/integration/stock.test.ts`, `tests/integration/concurrency/checkout-interleavings.test.ts`, `src/modules/users/tests/integration/minimise.test.ts`, and ~10 others in the graph) — All import `giveAddress` as a setup step before exercising order-placement logic. This file exists *for* those tests; it is not exercised by the addresses module's own test suite.

## Notes

- The address data is intentionally hard-coded and identical for every caller. There is no parameterisation; if a test needs a different address it should call `addressAdd` directly.
- The function is a `Promise<void>` (not `Promise<address>`), so callers cannot inspect the saved record—treat it purely as a "make this precondition true" helper.
- Because the module doc comment says "sibling's tests," do not add assertions or error handling here; it is setup, not a test fixture under the addresses module's own test ownership.
