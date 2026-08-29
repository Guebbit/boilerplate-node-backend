# src/modules/account/index.ts

## Purpose

Public barrel (single cross-module entry point) for the `account` module. It exposes exactly one cross-module capability—resolving a shipping address for checkout—and one supporting type. Everything else the module does (token issuance, session management, address CRUD) stays internal and is unreachable by sibling modules through this file.

## Key elements

- **`addressForCheckout`** (re-export from `./services/addresses`) — the sole function sibling modules may call; used by checkout to resolve the address an order ships to.
- **`AddressItem`** (type re-export from `./model`) — the shape of an address record, exported so consumers can type their parameters/return values without reaching into the model directly.

## Relationships

- **`src/modules/account/model.ts`** — source of the `AddressItem` type re-exported here.
- **`src/modules/account/services/addresses.ts`** — source of the `addressForCheckout` function re-exported here.
- **`src/modules/cart/services/checkout.ts`** — primary consumer; imports `addressForCheckout` (and likely `AddressItem`) from this barrel to resolve the shipping address during order finalization.
- **`src/modules/account/tests/unit/auth-surface.test.ts`** — exercises the module's authentication/token surface, which is deliberately *not* exported from this file; the tests reach internal files directly rather than through the barrel.

## Notes

- The token/session surface (`session/`, `module.ts`, `kernel/authentication.ts`) is intentionally excluded from this barrel. Sibling modules must never import a token from `account`; all requests authenticate through the `kernel/authentication.ts` port.
- Address CRUD is served by this module's own routes and is not part of the public API.
- `session/` is a folder with no barrel of its own—a deliberate structural signal that nothing outside the module may import it.
- The design rule (mirrored in `modules/products/index.ts`): a sibling module may import only from this file, never from deeper paths within `account/`.
