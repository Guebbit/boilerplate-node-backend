---
source: src/modules/users/tests/unit/token-methods.test.ts
sha256: a3aedab80a59aa30841a43ee53f0a17e9237d4f4711d1a3e689a39755a94b871
generated_at: 2026-09-23T19:37:10.691005+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/token-methods.test.ts

## Purpose

Unit tests for the `tokenAdd` and `tokenRemoveAll` instance methods on the user schema. These two methods are where a session is created or destroyed; the tests verify the database-first write order, the in-memory mirror (only when the `tokens` array was loaded), expiry semantics, and that unrelated token types are unaffected. The model is a double—no database is needed.

## Key elements

- **`methods`** — `userSchema.methods` extracted through `asStub`, exposing `tokenAdd` and `tokenRemoveAll` as standalone callables bound via `.call(document, …)`.
- **`documentDouble(tokens?)`** — factory returning a minimal Mongoose-like document: `_id`, an optional `tokens` array, a `constructor.updateOne` jest mock, and a top-level `updateOne` mock. Passing `undefined` for `tokens` simulates the `select: false` unloaded state.
- **`describe('tokenAdd')`** (9 cases) — covers: hash stored in DB, plaintext returned to caller, expiry derived from the given window, zero/negative window → no `expiration`, `timestamps: false` option, in-memory array mirror when loaded, success when array is `undefined`, and correct `type` filing (matters because revocation is `$pull` by type).
- **`describe('tokenRemoveAll')`** (4 cases) — covers: `$pull` by type only, other types untouched, `timestamps: false`, and success when the array was never loaded (write already landed; reporting failure would be a lie).

## Relationships

- **`src/modules/users/model.ts`** — source of `userSchema` (the methods under test), `TokenType` enum, `hashToken` utility, and the `Token` interface.
- **`tests/support/stub.ts`** — provides `asStub`, which types and re-exports the schema's `methods` property so the test can call them without a full Mongoose instance.

## Notes

- **Write-then-mirror order is the contract.** Both methods hit the database first and only update the in-memory `tokens` array if it was loaded. The tests explicitly assert the `undefined`-tokens path resolves without throwing—reversing the order would let a logout throw *after* tokens were already revoked.
- **Zero or negative `expirationMs`** must produce `expiration: undefined`, not `new Date(Date.now() + 0)` (which would be instantly expired). This is a deliberate guard against a class of "immediately unusable session" bugs.
- **`timestamps: false`** is passed as the third argument to `updateOne`; the tests assert it to ensure token operations don't bump `updatedAt`.
- **`tokenRemoveExpired` is deliberately absent.** It lives on `userRepository`, not the schema (it resolves an HTTP status). Its tests are in `repository.test.ts` and `account/tests/unit/token-cleanup-job.test.ts`.
