# db/demo/demo-data.json

## Purpose

Static seed data for the demo environment. It provides a fixed, deterministic set of records across all supported collections so that local development, CI tests, and the client-collections bundle have a known starting dataset without requiring a live database or random generation.

## Key elements

- **`_meta.shapes`** — Maps each collection name to its storage classification: `"stored"` (has its own persistent table/collection: addressBooks, carts, localeMessages, locales, wishlists) or `"response"` (derived or denormalized shape, e.g. orders embed product snapshots, products and users are served as API responses rather than stored verbatim).
- **`collections`** — The actual seed records keyed by collection name. Each array mirrors the shape that the corresponding migration/contract defines.
  - `addressBooks` — Two books with nested `items` (addresses), linked via `userId`.
  - `carts` — One cart with line-items referencing product IDs and quantities.
  - `localeMessages` — Translated strings scoped by `tenant` (`demo-be`, `demo-fe`), `locale` (`es`, `fr`, `it`), and a dot-notation `key`.
  - `locales` — Language registry entries with `active` flag, `direction`, `baseLanguage`, `revision`.
  - `orders` — Orders with **embedded** product snapshots (denormalized `product` object inside each `items[]` entry).
  - `products`, `users`, `wishlists` — Follow the same pattern (content truncated in this view).

## Relationships

- **db/demo/assemble.ts** — Reads this JSON and transforms/assembles the raw seed into the structure the demo runtime or migration runner expects (e.g., splitting `stored` vs `response` shapes, generating IDs if absent).
- **db/demo/index.ts** — Entry point that wires `assemble.ts` (and this file) into the broader demo bootstrap.
- **db/migrations/** — Defines the schema (fields, indexes, types) that every record in this file must satisfy; the seed is the "initial state" that migrations build upon.
- **scripts/contracts/client-collections-bundle.ts** — Consumes this file (or its assembled output) to produce the static bundle served to client-side tests/development.
- **tests/cross-cutting/seed-conformance.test.ts** — Validates that every record in this file conforms to the contract defined by the migrations and type definitions; a schema drift between this file and `db/migrations/` will cause test failures.

## Notes

- **`stored` vs `response` shapes** is the critical distinction: `response` collections (orders, products, users) may contain denormalized or computed fields (e.g., orders embed a full product snapshot) that do not map 1:1 to a single table column. Do not assume a flat schema for those.
- All IDs are 24-character hex strings (MongoDB ObjectId format). If you regenerate or add records, keep this convention to avoid breaking reference integrity across collections.
- `localeMessages` uses two tenants (`demo-be`, `demo-fe`); messages are not global but scoped per tenant. Adding a new translation means duplicating the key under the correct `tenant`.
- The file is intentionally static and committed — do not auto-generate or mutate it at runtime. Changes should go through a PR so `seed-conformance.test.ts` catches schema mismatches early.
