# src/modules/account/repository.ts

## Purpose

Data-access layer for a per-user address book (Mongoose). Every write is a full READ-MODIFY-WRITE cycle because the "exactly one default" invariant spans the entire `items` array and cannot be expressed as a single atomic `$set`/`$pull`. Mongoose optimistic versioning on `save()` is the concurrency guard; a conflicting write is expected to be retried manually rather than silently lost.

## Key elements

- **`addressBookRepository`** — the single exported constant. Extends `BaseRepository<AddressBookDocument>` (from `createBaseRepository`) with five domain methods:
  - `findByUserId(userId)` — returns the book or `null` (a user who never saved an address).
  - `addEntry(userId, entry)` — appends an entry; auto-creates the book if absent. Enforces the default invariant: first entry is always default; a later entry with `default: true` demotes the current holder.
  - `updateEntry(userId, addressId, changes)` — partial field update. `default: true` promotes this entry and demotes the rest; `false`/absent leaves the assignment untouched (demoting without a successor is intentionally not allowed here). Returns `null` if book or entry is missing.
  - `removeEntry(userId, addressId)` — deletes one entry. If the removed entry was default and others remain, the oldest survivor is promoted. Returns `null` if not found.
  - `deleteByUserId(userId)` — hard-delete of the whole document (account deletion path).
- **`BaseRepository` type annotation** — written out explicitly rather than inferred; Mongoose generics are too large for TypeScript to serialize across an export boundary (TS7056).

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** — provides `createBaseRepository` (generic CRUD + `toObjectId` helper) and the `BaseRepository` type that this file's export satisfies.
- **`src/modules/account/model.ts`** — source of `addressBookModel` (the Mongoose model), `applyAddressBookTransform` (passed to the base repo for serialization), and the `AddressBookDocument` type.
- **`src/types/index.ts`** — source of the `AddressInput` and `UpdateAddressRequest` types used in method signatures.
- **`src/modules/account/services/addresses.ts`** — consumes `addressBookRepository` as its persistence layer (service calls the repo methods listed above).
- **`src/modules/account/demo.ts`** — imports the repository for demonstration/seed scenarios.

## Notes

- The READ-MODIFY-WRITE choice is deliberate and documented in the file header; do not "optimise" these to atomic Mongoose updates without re-evaluating the default invariant.
- `updateEntry` treats `changes.default === false` (or absent) as a no-op for the default slot — it will not demote the current default. Demotion only happens when another entry claims `default: true` or when `removeEntry` promotes a survivor.
- All lookups by `addressId` compare via `String(item._id)`, not direct ObjectId equality, to match the string ids surfaced to callers.
- `deleteByUserId` returns `Promise<void>` via an explicit `.then(() => { })` to satisfy the declared return type.
