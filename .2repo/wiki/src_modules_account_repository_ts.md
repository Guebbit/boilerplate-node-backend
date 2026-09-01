# src/modules/account/repository.ts

## Purpose

Read-modify-write repository for a user's address book (a single Mongoose document holding an array of entries). It exists because the "exactly one default address" invariant spans the whole array and cannot be enforced with atomic `$set`/`$pull` operators, so every write loads the document, mutates it in memory, and saves.

## Key elements

- **`addressBookRepository`** (exported const) — the only export. Spreads the generic base from `createRepository` (giving `findById`, `deleteById`, etc.) and adds five address-book-specific methods. The type is written out explicitly because Mongoose's generic inference triggers TS7056 at an export boundary.
- **`findByUserId(userId)`** — returns the user's `AddressBookDocument` or `null` (null ≡ no addresses saved).
- **`addEntry(userId, entry)`** — creates the book if absent; enforces the default invariant (first entry is always default; a later `default: true` demotes the current holder).
- **`updateEntry(userId, addressId, changes)`** — partial-field edit on one entry; returns `null` for missing book/entry (→ 404). Setting `default: true` demotes all others; `false`/absent leaves default assignment untouched.
- **`removeEntry(userId, addressId)`** — filters the entry out; if it was the default, promotes `items[0]` (oldest remaining) to default.
- **`deleteByUserId(userId)`** — hard-deletes the entire book document (used on account deletion).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository`, `toObjectId`, and the `Repository<T>` type that form the base of `addressBookRepository`.
- **`src/modules/account/model.ts`** — supplies `addressBookModel` (the Mongoose model) and `applyAddressBookTransform` (used in the base-repository spread). Also exports the `AddressBookDocument` type used throughout.
- **`src/types/index.ts`** — source of the `AddressInput` and `UpdateAddressRequest` shapes accepted by `addEntry` / `updateEntry`.
- **`src/modules/account/services/addresses.ts`** — downstream consumer; calls into `addressBookRepository` to perform address CRUD for the HTTP layer.

## Notes

- **Read-modify-write, not atomic updates.** Concurrency is handled solely by Mongoose's optimistic versioning (`__v`) on `save()`. A stale write throws; the caller is expected to retry manually. This is acceptable because (per the JSDoc) users are unlikely to race the way multi-tab cart writes do.
- **Default-invariant rules are local to this file.** The logic for promoting/demoting the default lives in `addEntry`, `updateEntry`, and `removeEntry`—not in the model or a service layer. Changing the rule (e.g., "promote most-recent instead of oldest") requires touching all three methods.
- **`updateEntry` does NOT demote the default when `changes.default` is absent or `false`.** This is intentional: a partial edit shouldn't accidentally strip default status.
- **`removeEntry` promotes `items[0]`**, not the most recently added entry. Ordering in the array is insertion order.
- **`null` return from `findByUserId`, `updateEntry`, `removeEntry`** is the signal for the controller to return 404, rather than throwing a domain error.
