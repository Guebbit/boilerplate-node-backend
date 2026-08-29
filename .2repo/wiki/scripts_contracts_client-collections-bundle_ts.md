# scripts/contracts/client-collections-bundle.ts

## Purpose

Configuration file that drives generation of four API-client collections (Bruno, Insomnia, Mockoon, Postman) from the repository's OpenAPI contract. It is **not** committed (all four outputs are gitignored) and is generated on demand via `npm run contracts:bundle`. The file supplies the three pieces of information only this repo can provide to the `@guebbit/openapi-runnable-collections` generator: which module owns which path, which demo-data values to embed, and which authored rejection probes to include.

## Key elements

- **`COLLECTION_TOOLS`** — const array `['bruno', 'insomnia', 'mockoon', 'postman']` defining the target emitters.
- **`COLLECTION_NAME`** — display name ("Ecommerce Demo API") stamped onto generated collections.
- **`sections()`** — maps `SECTION_ORDER` to `{ name, paths }` objects using `sectionPaths`, giving the generator module→path ownership.
- **`values: ValueSources`** — the central config block:
  - `byProperty` — per-field example values (id, email, password, productId, etc.) sourced from the demo dataset.
  - `byEntity` — whole-record examples for `User`, `Product`, `Order`, `OrderItem`, `CartItem`.
  - `byOperation` — fixed bodies for `POST /account/login` (admin creds) and `POST /account/signup`.
  - `byFormat` — fallback values for `email`/`password` format-typed fields.
  - `pathParam(name, template)` — resolves `{id}`-style parameters to the correct seed record based on the path prefix.
  - `tokens` — `{{placeholder}}` strings for probe URLs (seed IDs, a soft-deleted product, an inactive product, a deleted order).
- **`PROBES: Partial<Record<SectionName, Probe[]>>`** — static import map from five modules (account, cart, orders, products, wishlist) to their `probes.ts` exports.
- **`PROBED_SECTIONS`** (exported) — the keys of `PROBES`; consumed by the completeness guard test.
- **`generate()`** — calls `generateCollections` with the spec, sections, probes, values, and targets. Deliberately **not** memoised.
- **`allProbes()`** (exported) — flattens all probe requests from a fresh `generate()` run; used by coverage checks.
- **`contentFor(tool)`** — returns a zero-arg closure that resolves the generated document for a single tool or throws if the emitter produced nothing.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** — provides `REPO_ROOT` (used to locate `openapi.yaml`) and the `ContractBundle` type.
- **`scripts/contracts/openapi-bundle.ts`** — provides `SECTION_ORDER`, `sectionPaths`, and the `SectionName` type that `sections()` and `PROBES` key off.
- **`scripts/build-contract-bundles.ts`** — the orchestrator that writes `openapi.yaml` (phase 1) and then calls `contentFor` for each tool (phase 2); this file's non-memoised `generate()` exists to stay correct relative to that ordering.
- **`db/demo/demo-data.json`** — sole data source for every example value, credential, and path-parameter in `values`.
- **`src/modules/{account,cart,orders,products,wishlist}/probes.ts`** — each exports a `probes` array statically imported into `PROBES`. Deleting a module breaks compilation here by design.
- **`tests/cross-cutting/probes-are-wired.test.ts`** — reads `PROBED_SECTIONS` to assert that every module declaring a `probes.ts` is actually wired into this file (guards against silent omission of a *new* module).
- **`tests/cross-cutting/contract-bundles.test.ts`** — exercises the generated output end-to-end.
- **`docs/theory/module-lifecycle.md`** — documents the compile-time-failure-on-deletion convention that the static imports here implement.

## Notes

- **Not memoised by design.** `build-contract-bundles.ts` writes `openapi.yaml` *before* calling the generator; a cached result would be derived from a spec that did not yet exist.
- **Static imports, not directory scans.** Adding a new module with a `probes.ts` but forgetting to add it to `PROBES` compiles fine but silently drops that module's probes from all four collections. The `probes-are-wired` test is the only guard against that gap.
- **Positional destructuring of `demo-data.json`** (`[seedAdmin, seedUser] = collections.users`, etc.) relies on the dataset being sorted by `_id`. If the seed script changes sort order, the destructured variables silently swap.
- **`byOperation` login uses the admin account** on purpose: a non-admin token would 403 every admin-only request in the collection, and login is the first request a human runs.
- **Postman is a distinct emitter**, not a renamed Insomnia. Postman Collection Format v2.1 splits URLs into host/path/query parts and reads those rather than the raw string; the compatibility direction is one-way only.
- **`seedSoftDeletedProductId` / `seedInactiveProductId` / `seedDeletedOrderId`** are derived via `.find()` with a fallback to the "first" record. If the dataset ever loses its soft-deleted/inactive fixtures, these tokens degrade to the default record and the probes that depend on them test nothing meaningful.
