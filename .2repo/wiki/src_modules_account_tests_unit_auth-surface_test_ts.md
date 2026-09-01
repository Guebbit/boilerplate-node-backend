# src/modules/account/tests/unit/auth-surface.test.ts

## Purpose
Pins the public surface of the account barrel by verifying that every re-export resolves to the **same object** its source exports (identity, not existence) and that no undeclared names leak out. This catches a class of bug—barrel re-exporting the wrong binding—that compiles cleanly and slips past smoke tests.

## Key elements
- **`ADDRESS_EXPORTS`** — const tuple declaring the sole allowed public name (`addressForCheckout`). Adding a new export requires updating this list, making barrel widening an explicit, review-visible decision.
- **`describe('the account barrel')`** — top-level suite containing two assertions:
  - *Identity check* (`toBe`): for each name in `ADDRESS_EXPORTS`, asserts `account[name]` is the very same binding as `addresses[name]`. A forked re-export (correct name, different object) fails here.
  - *Closed-surface check*: asserts the sorted key set of the account barrel equals the sorted `ADDRESS_EXPORTS`, so an accidental extra export fails the suite.

## Relationships
- **`src/modules/account/index.ts`** — the barrel under test; imported as `@modules/account`. The suite asserts its key set and binding identities.
- **`src/modules/account/services/index.ts`** — the services barrel imported as `@modules/account/services`; serves as the reference side of the identity comparison for `addressForCheckout`.

## Notes
- The test deliberately excludes any token/auth-port surface: the kernel's auth port is the only auth path per request and is wired from `module.ts` directly, so it is not expected on the account barrel.
- Uses `toBe` (reference identity), not `toEqual`. This is intentional—a re-export that points at a *different* object with the same shape would pass an equality check but break callers relying on the singleton.
- `Object.keys(...).toSorted()` requires Node 20+ / ES2023 `Array.prototype.toSorted`.
