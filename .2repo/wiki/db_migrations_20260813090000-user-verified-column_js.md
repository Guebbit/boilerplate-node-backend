# db/migrations/20260813090000-user-verified-column.js

## Purpose

Backfills the `users.verified` field by setting it to `true` on every pre-existing row, grandfathering accounts that predate the email-confirmation flow. Without this, the schema's default (`false`, correct for a new self-signup) would retroactively mark all long-standing users as unverified and surface a "confirm your email" prompt to them.

## Key elements

- **`up(db)`** — `updateMany({ verified: { $exists: false } }, { $set: { verified: true } })`. Only touches rows that lack the field, so it is safe to re-run and will not clobber a `false` legitimately written by a post-deploy signup.
- **`down(db)`** — `updateMany({}, { $unset: { verified: '' } })`. Removes the field from all rows; it does not attempt to restore the prior (non-existent) state.

## Relationships

No dependency-graph neighbors.

## Notes

- **Idempotency is load-bearing.** The `$exists: false` guard is what prevents re-running from destroying a legitimate `false`. `migrate-mongo status` does not guarantee single execution; the query itself must be safe to repeat.
- **`down` is irreversible.** Once the field is unset, the distinction between "grandfathered", "confirmed via flow", and "never confirmed" is unrecoverable. Treat rollback as a data-loss operation.
- **Convention:** This is a migrate-mongo migration (`module.exports = { up, down }`), not a framework-mapped model change. It operates directly on the `users` collection.
