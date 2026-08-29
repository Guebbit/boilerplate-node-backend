# db/migrations/20260818120000-locale-entry-scope.js

## Purpose

Adds a `scope` field (`'api'` | `'app'`) to the `localemessages` collection and promotes it into the row's unique identity. Before this migration, rows were identified by `(locale, key)` because there was only one dictionary to override; with two dictionaries (API vs. app) that share keys like `generic.error-internal`, the key alone is ambiguous. The migration backfills existing rows and swaps the unique index accordingly.

## Key elements

- **`up(db)`** — Runs three steps in a fixed, non-interchangeable order:
  1. `updateMany({ scope: { $exists: false } }, { $set: { scope: 'app' } })` — backfills only rows that lack the field, so a re-run never overwrites a deliberately set scope.
  2. `createIndex({ locale, scope, key }, { name: 'localeMessages_locale_scope_key', unique: true })` — installs the stricter constraint.
  3. `dropIndex('localeMessages_locale_key')` (wrapped in `try/catch`) — removes the old constraint last so an interrupted run leaves the stricter index in place.

- **`down(db)`** — Restores the old `(locale, key)` unique index and drops the new one. Intentionally does **not** delete the `scope` column (would destroy user-entered data). May legitimately fail if the database already holds the same key under both scopes.

## Relationships

No automatic graph neighbors are registered. The file header and body reference two external contracts:

- `src/modules/locales/model.ts` — defines the schema; index names here must match what that module declares.
- `tests/unit/db/migration-model-indexes.test.ts` — the test that detects a name disagreement between this migration and the model.

## Notes

- **Order matters.** Backfill must precede index creation because Mongo indexes a missing field as `null`; creating the unique index before backfill would silently allow duplicate `(locale, null, key)` rows until a real scope is written.
- **Index names are load-bearing.** Mongo identifies an index by *both* name and key spec. A name mismatch between this file and `model.ts` won't raise a runtime error — only the unit test above will catch it.
- **`down` is lossy by design.** If a database has already stored the same key under both `api` and `app`, restoring the old unique index will throw. The file deliberately does not delete rows to "fix" this; that is a human decision.
- **Idempotency of `up`.** The `$exists: false` filter and Mongo's no-op-on-match `createIndex` make `up` safe to re-run.
