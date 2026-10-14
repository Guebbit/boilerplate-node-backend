---
source: src/modules/addresses/service.ts
sha256: 1df4be44890c409d71e654c1a0665afeb4d4645d01ff8e948fcd8667d993c1ee
generated_at: 2026-10-14T14:53:46.126705+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/service.ts

## Purpose

Service layer for the address-book module. It wraps repository calls in HTTP-shaped results (success/reject), applies presenters, and exposes the six domain operations (get, add, update, set-default, remove, checkout-lookup) plus two lifecycle hooks that controllers and the module manifest invoke.

## Key elements

- **`addressesGet`** – Returns the user's full book as an `AddressesView`; absence and emptiness both yield an empty view (never 404).
- **`addressAdd`** – Calls `addEntry`; on the `ADDRESS_BOOK_FULL` sentinel returns 409, otherwise returns 201 with the last item in the array as the newly created entry.
- **`addressUpdate`** – Calls `updateEntry`; 404 if the entry isn't found, 200 with the updated entry otherwise.
- **`addressSetDefault`** – Calls `setDefault`; 404 or 200 with the now-default entry. The demoted sibling is a different row, so clients should refetch the book.
- **`addressRemove`** – Calls `removeEntry`; returns the **whole book** (not just the removed entry) because the one-default invariant may have shifted to another row.
- **`addressForCheckout`** – Resolves the shipping address for a given `addressId` or the default. Tri-state return: `AddressItem` (found), `null` (id supplied but not found / not owned → checkout must refuse), `undefined` (no id supplied, no default → shipping optional). Collapsing `null`/`undefined` would let a stale id silently downgrade to "no address".
- **`addressesDeleteByUserId`** – Hard-delete hook (`personalData.erase`); joins the caller's Mongoose `ClientSession` transaction.
- **`addressesMinimise`** – Inactive-account hook (`personalData.minimise`); same repository call without a transaction. Idempotent.
- **`reencryptAddressBooks`** – Re-exported from `./reencrypt` so callers can import it from the service barrel.

## Relationships

| Neighbor | Interaction |
|---|---|
| `repository.ts` | All persistence goes through `addressBookRepository`; the `ADDRESS_BOOK_FULL` sentinel is the only non-data return the service checks. |
| `presenter.ts` | Transforms raw repository items into `Address` / `AddressesView` DTOs before they reach the response helpers. |
| `model.ts` | Supplies the `AddressItem` type used in `addressForCheckout`. |
| `@infrastructure/http/response` | `generateSuccess` / `generateReject` shape every return value; `ResponseSuccess` / `ResponseReject` types annotate signatures. |
| `@infrastructure/i18n` | `t('addresses.*')` provides the human-readable message strings in each response. |
| Controllers (`post-address`, `update-address`, `put-address-default`, `get-addresses`, `delete-address`) | Each controller delegates to exactly one exported service function; the service owns the response construction. |
| `module.ts` | Registers `addressesDeleteByUserId` and `addressesMinimise` in the `personalData` hook manifest. |
| `reencrypt.ts` | Re-exported through this file so external importers can reach `reencryptAddressBooks` via the service barrel. |
| `index.ts` | Barrel that re-exports everything from this file for module-level consumers. |
| `tests/factories.ts` | Provides test fixtures for exercising the service functions in unit/integration tests. |

## Notes

- **Response contract (module doc):** single-entry writes (add, update, set-default) return *the entry*; list-level writes (remove) return *the whole book* because "exactly one default" is a list property. Clients showing the book should refetch after `addressSetDefault` or `addressRemove`.
- **`addressAdd` last-item assumption:** the 201 path grabs `book.items.at(-1)!` on the basis that `addEntry` appends. If the repository ever reorders, this breaks silently.
- **Tri-state in `addressForCheckout`:** `null` ≠ `undefined`. Callers (e.g. checkout) must distinguish "explicitly chosen but invalid" from "nothing chosen" and must not conflate them.
- **No direct DB access:** the service never imports Mongoose models or performs queries itself; `ClientSession` is only threaded through to the repository for the erase hook.
