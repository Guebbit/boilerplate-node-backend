# src/modules/account/tests/unit/factory.test.ts

## Purpose
Unit tests for the `makeAddressBook` fixture builder, verifying that it produces Mongoose documents with correct `ObjectId` fields, proper optional-field handling, and passthrough of deliverable address fields — the contract other tests in the account module rely on.

## Key elements
- **`makeAddressBook`** (imported) — the factory under test; accepts `{ userId, items? }` and returns an address-book document.
- **`DELIVERABLE`** — shared constant holding the required address fields (`fullName`, `street`, `city`, `zip`, `country`, `default`) used across several test cases.
- **`USER` / `ADDRESS`** — hex-string constants representing valid 24-char MongoDB ObjectIds for the owner and a single entry.
- **Six `it` blocks** covering:
  - `userId` is a real `Types.ObjectId`, not a plain string.
  - `items` key is **absent** (not `undefined`) when no entries are supplied.
  - Each entry's `_id` is a `Types.ObjectId` matching the provided `id`.
  - Deliverable fields pass through unchanged (`toMatchObject`).
  - `label` and `phone` are **absent** (via `Object.hasOwn`) when not supplied.
  - `label` and `phone` are preserved when supplied.

## Relationships
- **`src/modules/account/factory.ts`** — sole production dependency; exports the `makeAddressBook` function that this file imports and exercises.
- **`mongoose`** (`Types`) — used exclusively for `toBeInstanceOf(Types.ObjectId)` assertions, confirming the factory emits real ObjectId instances rather than hex strings.

## Notes
- The tests deliberately assert key **absence** with `Object.hasOwn` rather than checking for `undefined`. The file's comment explains why: in Mongoose a field present as `undefined` is serialized differently from a field that is simply not in the document, so the factory must *omit* optional keys rather than set them to `undefined`.
- Each entry's `_id` is critical: the `PUT /account/addresses/:addressId` route names entries by their own id, so a fixture lacking `_id` would seed entries that cannot be edited or deleted.
- The test file does **not** mock `makeAddressBook`; it calls the real implementation. It is a pure unit test with no I/O.
