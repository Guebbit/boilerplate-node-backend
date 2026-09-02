# db/demo/demo-data.json

## Purpose

Static seed dataset used to populate a local or CI database with realistic demo records. It provides the baseline data for development, integration tests, and client-side preview environments so that the application has users, products, carts, orders, addresses, and localized strings without requiring a running backend or manual data entry.

## Key elements

- **`_meta.shapes`** — Declarative map of every collection name to its persistence role (`"stored"` for server-side collections like addressBooks, carts, locales, localeMessages, wishlists; `"response"` for derived/client-facing shapes like orders, products, users). Consumers use this to decide what to hydrate from the DB versus what to synthesize at request time.
- **`collections.addressBooks`** — Address-book records, each containing a `userId` FK and an array of `items` (street-level addresses with `default` flag, country code, phone, etc.).
- **`collections.carts`** — Cart records keyed to a `userId`; each cart holds an `items` array of `{ productId, quantity }` pairs referencing product IDs from the (truncated) `products` collection.
- **`collections.localeMessages`** — I18N key/value strings scoped by `key`, `locale` tag, and `tenant` (`demo-be` vs `demo-fe`). Used to verify that the locale resolution pipeline returns the correct string per tenant/locale pair.
- **`collections.locales`** — Locale definitions (`tag`, `nativeName`, `baseLanguage`, `direction`, `active` flag, `revision`). Includes at least four locales (es, fr, it, ja); `es` and `it` are active, `fr` and `ja` are inactive.
- **Remaining collections** (`orders`, `products`, `users`, `wishlists`) — Present per `_meta.shapes` but truncated in the excerpt; follow the same "array of flat records with ObjectIds and `createdAt`/`updatedAt`" pattern.

## Relationships

- **`scripts/contracts/client-collections-bundle.ts`** — Imports (or inlines) the `response`-shaped collections from this file to produce a single bundled payload shipped to the client during demo/preview mode. The `_meta.shapes` map is the contract that tells the bundler which collections are client-visible.
- **`tests/cross-cutting/seed-conformance.test.ts`** — Loads this file and asserts that every record in every collection satisfies the domain schema (required fields, ID format, referential integrity between carts→products, addressBooks→users, localeMessages→locales, etc.). This file is the fixture under test.

## Notes

- IDs are 24-hex-character MongoDB ObjectIds; some newer records (April 2025 carts) use a zero-padded scheme (`67f0c3…`) to keep IDs lexicographically ordered. Do not assume a single ID generator.
- All `createdAt`/`updatedAt` timestamps are identical per record (seeded, not organically generated). Tests must not rely on `updatedAt > createdAt`.
- The `tenant` field on `localeMessages` distinguishes backend error strings (`demo-be`) from UI strings (`demo-fe`); a locale can have messages in both tenants for the same `key`.
- The `_meta` block is a **convention, not data**: it is not a Mongo collection and must be stripped before any `insertMany`-style seeding.
