---
source: tests/support/owned-ids.ts
sha256: de6eb414543e2781741628c07657843384b34eaaeee4a3c8798ee31f85413e57
generated_at: 2026-10-29T07:09:16.477499+00:00
model: ollama:qwen3.8:27b
---

# tests/support/owned-ids.ts

## Purpose

Single source of truth that classifies every customer-facing ID parameter (path, body, query) into ownership families. The ownership sweep tests hold each entry to one behavioral claim (e.g. "another customer's id answers exactly like a missing one"), and a completeness check derived from mounted routes and `openapi.yaml` verifies no id is left unclassified.

## Key elements

- **`OwnedId`** — interface with `key` (route/field in the canonical shape) and `module` (folder under `src/modules/` that mounts the route).
- **`of`** — internal helper that maps a list of key strings into `OwnedId[]` for a given module.
- **`NOT_AN_OWNED_ID`** — ids that name no customer-owned row (public `productId`, method/provider names). A foreign value here cannot leak another customer's data.
- **`NOT_AN_ID_BY_NAME`** — request properties named `*Id` that are *not* typed `Id` (e.g. `shippingMethodId`); the tripwire fails on any other untyped `*Id`.
- **`OWNED_PATH`** — path params (`METHOD /path/:param`) where a foreign id must return 404.
- **`OWNED_BODY`** — body fields (`METHOD /path#field`) where a foreign id must answer like a missing one with the documented status.
- **`OWNED_FILTER`** — list-filter fields where a foreign id narrows the result to an empty page.
- **`FAMILIES`** — aggregate object exposing all four lists by name for the completeness check.

## Relationships

- **`tests/contract/ownership-contract.test.ts`** — imports the `OWNED_*` and `NOT_AN_OWNED_ID` lists and drives the sweep: for every entry it asserts the "foreign id ≡ missing id" invariant.
- **`tests/contract/ownership-shop.contract.test.ts`** — same role scoped to shop-specific routes (cart, checkout, wishlist, stock-alerts, returns).
- Both tests also use `FAMILIES` to feed the completeness check that cross-references derived routes and `openapi.yaml`.

## Notes

- **No module imports by design.** `demo:remove` strips the shop from the app; this file must remain valid afterward. The `module` field on each entry lets a completeness check drop an entry whose module was stripped rather than failing.
- **Key shapes are fixed conventions:** path ids are `METHOD /path/:param` (no trailing slash); body/query ids are `METHOD /path#field`; an array is marked with `[]` (e.g. `lines[].productId`).
- The file's doc comment explicitly states the sorting is manual but the *finding* is not — the completeness check derives the universe of ids from the live app, so a new route with an id parameter will fail the sweep until it is classified here.
