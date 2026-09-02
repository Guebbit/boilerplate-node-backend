# db/migrations/20260901120000-hash-user-tokens.js

## Purpose

One-time data migration that converts every plaintext token stored in `users.tokens[].token` (refresh JWTs, password-reset tokens, delete-confirmation tokens) into a SHA-256 hex digest, in place. Closes a security gap: the schema's `select: false` kept tokens off ordinary reads but did not protect against a single read-only collection exposure.

## Key elements

- **`HEX64`** — regex (`/^[\da-f]{64}$/`) used to detect tokens that are already 64-char hex digests, making the migration idempotent.
- **`hashToken(token)`** — wraps `crypto.createHash('sha256')` to produce a hex digest. Mirrors the same-named function in `src/modules/users/model.ts`.
- **`module.exports.up(db)`** — Opens a cursor over `users` documents that have at least one token entry, maps each token through `hashToken` (skipping entries that already match `HEX64`), then writes the updated array back via `updateOne`.
- **`module.exports.down()`** — Intentionally **throws** an error. SHA-256 is irreversible; the only manual revert (truncating all token arrays) would sign every account out, so it is refused automatically.

## Relationships

No dependency-graph neighbors. The file references `src/modules/users/model.ts` only as a convention: `hashToken` here must stay byte-identical to the runtime hash used at verification time.

## Notes

- **Idempotent by design.** A value that already looks like a 64-char hex string is left untouched, so re-running against a partially-migrated or post-deploy database is a safe no-op for those rows.
- **Not `updateMany`.** Mongo update operators cannot compute a per-field hash; the migration walks a cursor and issues one `updateOne` per document.
- **SHA-256, not bcrypt/argon2.** Tokens already carry ≥128 bits of entropy (`randomBytes(16)` or a signed JWT), so there is no low-entropy secret to stretch; a KDF would only add latency to the refresh path hit on a timer by every authenticated client.
- **`down` is a hard error, not a no-op.** Running `migrate-mongo down` will fail on this step. Reverting by hand requires manually clearing all `users.tokens` arrays, which signs out every user on every device.
