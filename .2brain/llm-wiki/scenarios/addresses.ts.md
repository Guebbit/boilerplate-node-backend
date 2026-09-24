---
source: scenarios/addresses.ts
sha256: b22287d03c835ba9e0e4bc158776e27a4b52136dddb57aee79c15bed9715453f
generated_at: 2026-09-23T17:16:37.785151+00:00
model: ollama:qwen3.8:27b
---

# scenarios/addresses.ts

## Purpose

Seeds the demo address-book collection with two owner-scoped fixtures: a two-entry book for the admin (to make the "set as default" flow observable) and a single-entry book for the ordinary customer (to exercise the optional-`phone` path). Also exposes the seed function that `seedShop` walks.

## Key elements

- **`addressBookFixtures`** — Array of two `AddressBook` objects built via `makeAddressBook`. The admin's book has a default ("home") and a non-default ("office") entry; the customer's book has one default entry with `phone` intentionally omitted.
- **`seedAddressBooksCollection()`** — `Promise<SeedOutcome[]>`. Inserts each fixture through `insertIfAbsentForOwner(addressBookRepository, book)`. Registered in `scenarios/index.ts` under `shopModules` so `seedShop` picks it up.

## Relationships

- **`scenarios/accounts.ts`** — Source of `SEED_ADMIN_ID` and `SEED_USER_ID`, which set each book's `userId`.
- **`scenarios/seed.ts`** — Provides the `SeedOutcome` type and `insertIfAbsentForOwner` helper used for idempotent insertion keyed on `userId`.
- **`scenarios/index.ts`** — Declares `seedAddressBooksCollection` in its `shopModules` list; `seedShop` iterates that list and invokes the function.
- **`src/modules/addresses/factories.ts`** — `makeAddressBook` constructs the typed book objects from the inline entry data.
- **`src/modules/addresses/repository.ts`** — `addressBookRepository` is passed to `insertIfAbsentForOwner` as the write target.

## Notes

- Idempotency is keyed on **`userId`** (via `insertIfAbsentForOwner`), not on the book's `_id`. Pinned entry `_id`s are minted with `new Types.ObjectId()` and are required by the contract but never looked up by value; the book-level `_id` is left to the repository.
- The admin's two entries exist so a "set as default" demo can flip the flag onto the second entry while the first (already snapshotted into a seeded order's `shippingAddress`) remains unchanged—demonstrating that an order's address is a **snapshot**, not a reference.
- The customer's single entry omits `phone` entirely (not an empty string) to represent the field's optionality in the contract.
