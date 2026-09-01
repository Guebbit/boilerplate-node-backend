# src/modules/users/tests/unit/token-methods.test.ts

## Purpose

Unit tests for the `tokenAdd` and `tokenRemoveAll` instance methods on the user Mongoose schema. The tests exercise the DB-first-then-mirror write order that these methods require (because `tokens` is `select: false`), using a hand-rolled document double instead of a real database.

## Key elements

- **`documentDouble(tokens?)`** — Factory that returns a minimal Mongoose-document-shaped object (`_id`, `tokens`, `constructor.updateOne`, `updateOne`). The optional `tokens` argument lets each test declare explicitly whether the array was loaded (`[]` or populated) or absent (`undefined`), which is the core distinction these methods must handle.
- **`methods`** — `asStub<…>(userSchema.methods)` that types and isolates just `tokenAdd` and `tokenRemoveAll` so they can be `.call`-ed against a document double without a full model instance.
- **`describe('tokenAdd')`** — 8 cases covering: `$push` shape, return value, expiry computation (normal / zero / negative window), `timestamps: false`, mirroring into a loaded array, success with an unloaded array, and correct `type` filing.
- **`describe('tokenRemoveAll')`** — 4 cases covering: `$pull` by type, leaving other token types untouched, `timestamps: false`, and success with an unloaded array.

## Relationships

- **`@modules/users/model`** — imports `userSchema` (the source of the `.methods` under test) and the `Token` type used in assertions.
- **`@modules/users`** (index) — imports the `TokenType` enum used throughout test data and expectations.
- **`@tests/stub`** (`asStub`) — provides the `asStub` helper that wraps `userSchema.methods` with a structural type so the tests can reference only the two methods they need.

## Notes

- **Zero / negative expiry edge case:** Passing `expirationMs` of `0` or negative must result in `expiration` being `undefined`, *not* `new Date(Date.now() + 0)`. The tests pin this explicitly because a token that expires at issuance is silently broken.
- **`select: false` contract:** The "unloaded array" tests (`documentDouble(undefined)`) exist to guard against a regression where a throw during the in-memory mirror would surface *after* the DB write already landed, making a logout report failure despite tokens being revoked.
- **`tokenRemoveExpired` is absent by design:** A trailing comment records that this method was moved to `userRepository.tokenRemoveExpired` (and its tests to `repository.test.ts` / `token-cleanup-job.test.ts`) because it resolved an HTTP status, which belongs below the schema layer. Do not re-add tests for it here.
- **`timestamps: false` is asserted on every `updateOne` call** — token add/remove must not bump the user's `updatedAt`.
