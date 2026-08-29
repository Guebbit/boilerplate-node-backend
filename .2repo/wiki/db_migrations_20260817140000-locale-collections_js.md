# db/migrations/20260817140000-locale-collections.js

## Purpose

Creates two unique indexes on the `locales` and `localemessages` collections. There is no data migration; the collections start empty and are populated by `npm run db:seed`. The migration's sole purpose is enforcing two uniqueness constraints that prevent concurrent check-then-insert races (duplicate locale tags, duplicate locale+key pairs).

## Key elements

- **`up(db)`** — Creates two unique indexes in parallel:
  - `locales_tag` on `locales.{ tag }` — prevents two concurrent locale creations from both passing the "absent" check and both writing.
  - `localeMessages_locale_key` on `localemessages.{ locale, key }` — same race protection one level down; also serves as the compound index for `find({ locale })` queries (prefix of the compound key), so a separate `locale`-only index would be redundant write cost.
- **`down(db)`** — Drops both indexes (best-effort, swallows errors). Explicitly does **not** delete rows: rolling back the schema is not a reason to destroy typed translation data.

## Relationships

No graph neighbors are recorded. However, the index **names** are load-bearing contracts with:

- `src/modules/locales/model.ts` — issues its own `createIndex` calls at startup using the same names and key specs.
- `tests/unit/db/migration-model-indexes.test.ts` — verifies the two sources agree, since a booted DB and a migrated DB only diverge on a real deployment.

## Notes

- **Index names are a cross-file contract.** Mongo identifies an index by *name* as well as key spec. The same key under a different name raises `IndexKeySpecsConflict` rather than silently no-oping. If you rename the index in this file, you must rename it in the model simultaneously, or startup will crash.
- **Collection naming.** The Mongo collection is `localemessages` (lowercased, pluralised from the `LocaleMessage` model), not `localeMessages` or `locale_messages`. Same derivation as `auditlogs` from `audit-logs`.
- **`down` is intentionally lossy.** After rollback the two uniqueness guarantees are gone and the race windows reopen. This is documented in the migration rather than discovered in production.
