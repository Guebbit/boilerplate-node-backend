# docs/api/contract-fragmentation.md

## Purpose

Documents the **ownership model** for shared API contracts (OpenAPI and AsyncAPI): which repo owns what, how per-module fragments are compiled/merged into the seven committed bundles, and how the frontend receives byte-identical copies. It complements `openapi-workflow.md` (which covers *how to change* the contract) by covering *who owns it, where it lives, and how it reaches the frontend*.

## Key elements

- **Seven bundles** — `openapi.yaml`, `asyncapi.yaml`, `asyncapi.public.yaml`, and four untracked client collections (`bruno`, `insomnia`, `mockoon`, `postman`). Only `openapi` and `asyncapi-public` are copied into `boilerplate-vue-frontend`.
- **Four verbs** — *compiled* (`redocly bundle` for OpenAPI), *merged* (`scripts/contracts/asyncapi-bundles.ts` copies maps for AsyncAPI), *generated* (client collections built whole from `openapi.yaml` + demo dataset). The distinction is structural, not cosmetic.
- **Fragment ownership rule** — a module owns the paths under its `basePath`; shared schemas, security schemes, and the `GET /` health probe live in `shared/contracts/openapi.root.yaml`.
- **`npm run contracts:bundle`** — builds the committed specs; `-- <name>` builds a single client collection.
- **`npm run check:contracts-bundle`** — CI gate that fails if any committed bundle is stale relative to its fragments.
- **`tests/cross-cutting/contract-bundles.test.ts`** — asserts every bundle equals its committed file on every run; also asserts the 252 comment lines in source fragments.
- **`scripts/spec-identity.ts`** — compares this repo's `openapi.yaml` against the frontend's copy byte-for-byte; fails the build on divergence.
- **Module ownership table** — maps all 13 enabled modules (account, orders, users, products, cart, wishlist, payments, delivery, inventory, observability, feedback, locales, audit-logs) to their `basePath`, OpenAPI tags, and operation count.

## Relationships

- **`docs/api/openapi-workflow.md`** — explicitly cross-referenced: that page covers the edit-and-rebundle procedure; this page covers the ownership and layout rules that procedure operates under.
- **`docs/modules/products.md`** — used as the worked example of a module that owns its `openapi.yaml` fragment (10 operations under `/products`).
- **`docs/tools/contract-testing.md`** — the `contract-bundles.test.ts` and `check:contracts-bundle` gate described here are the contract-testing tools that page documents from a procedural angle.
- **`docs/reference/contracts.md`** — reference catalog of the contract files and shared fragments that this page explains architecturally.
- **`docs/reference/scripts.md`** — lists `scripts/contracts/asyncapi-bundles.ts`, `scripts/spec-identity.ts`, and the `contracts:bundle` npm script that this page assigns semantics to.

## Notes

- The frontend **never bundles**. `redocly bundle` output is version-dependent; bundling in two repos from the same fragments can produce different bytes. The correct flow is: bundle once here, commit the result, copy it byte-identical.
- `asyncapi.yaml` (the full bundle) is **not** shared with the frontend. Only `asyncapi.public.yaml` crosses the repo boundary. The full file is marked `shared: false` in the bundle config.
- Comments in source fragments do **not** survive `redocly bundle` (Redocly parses, not concatenates). They are read and edited in the per-module files, where they are also asserted by tests.
- `audit-logs` has no HTTP surface of its own — it is consumed through `observability`'s `GET /observability/audit`. A zero-fragment module is expected, not an error.
- Fragment by `basePath`, not by tag. `Auth` and `Account` are two tags over one `/account` `basePath` and belong to a single fragment.
- Duplicating a shared schema into two module fragments is the primary silent-drift failure mode; nothing in the tooling catches it except careful reading.
