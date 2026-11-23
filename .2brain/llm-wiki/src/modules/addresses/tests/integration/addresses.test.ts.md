---
source: src/modules/addresses/tests/integration/addresses.test.ts
source_sha256: 77e202b4a827a30a2fc1c50d1dec4ab4c3574da61bd2973fbfd59d8205d48f81
context_sha256: df9821d1677a6744771d5be8f74457d78628b63a43423598cee47ffcb4e71b50
generated_at: 2026-11-22T04:16:26.303987+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/tests/integration/addresses.test.ts

## Purpose
Integration tests for the address book, run against a real test database through `addressService`. The file is organised around one invariant, that a non-empty book has exactly one default entry however it got there. It also covers ownership (someone else's entry answers like a nonexistent one), the per-book size cap, and PII encryption at rest.

## Key elements
- **`setupTestDb()`**: called at module level to set up the test database.
- **`labelsOf(userId)`**: returns the labels of a user's book in stored order.
- **`withCap(body)`**: runs `body` with `NODE_ADDRESS_BOOK_MAX=3` via `withEnvironmentOverrides`, so cap tests don't write many entries.
- **`defaults(userId)`**: lists the book through the service and returns only entries flagged `default`.
- **`describe('the one-default invariant')`**:
  - The first entry becomes default whether or not it asked.
  - `setDefault` promotes the target and demotes the holder, is idempotent, and returns 404 for another user's entry.
  - Creating with `default: true` demotes the holder.
  - An ordinary `update` leaves the default alone.
  - Removing the default promotes the oldest remaining entry.
- **`describe('adding an entry that claims the default')`**:
  - Exactly one default remains after the write.
  - A label like `$items` is stored as plain text, because the pipeline wraps entries in `$literal`.
  - Both `createdAt` and `updatedAt` are stamped on a book created by its first entry.
- **`describe('the address-book cap')`**:
  - The entry past the cap is refused with a 409 and code `ADDRESS_BOOK_LIMIT_REACHED`, and nothing is written.
  - Removing an entry lets a new one in again.
  - A burst of 12 concurrent adds yields exactly 3 successes and 9 failures.
  - A burst of concurrent `default: true` adds still leaves one default.
- **`describe('ownership')`**: another user's `update` and `remove` both return 404, and the owner's entry stays unchanged (city still `Modena`).
- **`describe('PII at rest')`**:
  - Reads the raw document through `addressBookModel`, bypassing the repository's decrypt, and asserts the fields are not plaintext.
  - `fullName` matches the versioned-secret format `/^v\d+(?::[\da-f]+){3}$/`.
  - A round trip through the service returns the submitted plaintext.
  - A further case asserts that a field copied onto another entry or field is refused because the entry id is in the AAD. The visible content cuts off partway through it.

## Relationships
- `../../service` (`addressService`): the system under test, with `list`, `create`, `setDefault`, `update` and `remove`.
- `../../model` (`addressBookModel`): used directly for raw reads, to check timestamps and the stored ciphertext.
- `./fixtures`: provides the `HOME` and `OFFICE` address payloads.
- `@modules/users/tests/factories` (`createUser`): creates owners and strangers.
- `@tests/setup-test-db`: provides `setupTestDb`.
- `@tests/environment`: provides `withEnvironmentOverrides`, used for the cap.
- `@tests/response`: provides `asReject`, which narrows a failed result so `.status` and `.errors` can be read.

## Notes
- The file imports the service and model by relative path, not through the module's `index.ts`, because the repo's barrel rules apply to tests too.
- Tests that create several users pass distinct `email` and `username` values, such as `owner2`/`ownerb`.
- The cap tests assert the cap holds under concurrency, since the limit is enforced in the update filter.
