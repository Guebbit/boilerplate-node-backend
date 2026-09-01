# src/modules/account/index.ts

## Purpose

Barrel file that defines the **only** public import surface of the `account` module for sibling modules. It deliberately exposes a single cross-module concern—the address a checkout resolves—and explicitly withholds the session/token API (which is handled exclusively by `kernel/authentication.ts`).

## Key elements

- **`addressForCheckout`** (re-exported from `./services/addresses`) — the one function other modules may call to resolve a checkout address.
- **`AddressItem`** (re-exported type from `./model`) — the stored address-book entry shape used as the parameter/return shape of the function above.

## Relationships

- **`src/modules/account/services/addresses.ts`** — source of `addressForCheckout`; this barrel re-exports it.
- **`src/modules/account/model.ts`** — source of the `AddressItem` type; this barrel re-exports it.
- **`src/modules/cart/services/checkout.ts`** — the documented consumer (`customer-supplier` edge) that imports `addressForCheckout` through this barrel to resolve the shipping/billing address during checkout.
- **`src/modules/account/tests/unit/auth-surface.test.ts`** — tests the account module's auth-facing surface; relevant context for why the token API is *not* published here.

## Notes

- This file is the **sole** entry point other modules are allowed to import from `account/`. Internal files (`session/`, other services) must be accessed only via this barrel—see the analogous rule in `modules/products/index.ts`.
- The session/token surface is intentionally *absent* from this barrel; all authentication routing goes through `kernel/authentication.ts`. Do not add token-related exports here.
- For the full module design rationale, see `docs/modules/account.md`.
