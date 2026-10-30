---
source: tests/contract/ownership-contract.test.ts
sha256: 9b3e3754c659107d175fa5be7ac34b78766d74c7226fd556e97793adb228d3c0
generated_at: 2026-10-29T06:39:10.010145+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/ownership-contract.test.ts

## Purpose

Contract test that verifies **ownership (IDOR) protection** on the foundation families (saved addresses, login sessions): a customer who sends another customer's ID in a path or body receives a 404 indistinguishable from a nonexistent ID. It also enforces **completeness** — every ID-typed property the mounted routes and `openapi.yaml` expose to a customer must appear in exactly one `owned-ids.ts` family, and no stale or duplicate entries may exist.

## Key elements

- **`propertiesOf(node, prefix, trail)`** — recursively walks raw OpenAPI schema nodes (including `allOf`/`oneOf`/`anyOf`, `items`, nested `properties`) to find fields typed as `#/components/schemas/Id` or scalar fields that merely *look* like IDs. Uses a `trail` guard against self-referencing schemas.
- **`requestProperties(path, method)`** — assembles body and query ID properties for one operation by reading the spec directly.
- **`customerRoutes`** — filters `everyMountedRoute()` to routes that have an identity guard **and** whose permissions every one of which the customer role satisfies (checked via `holds(callerAs('customer'), …)`).
- **`derive()`** — produces the full set of derived ID keys (`METHOD path` or `METHOD path#field`) and any untyped `*Id`-named properties, from the intersection of mounted routes and the OpenAPI contract.
- **`seedFoundation()`** — over HTTP, creates a victim user's address and captures a session ID, then authenticates an attacker as a plain customer.
- **`foundationCases(world)`** — builds the `OwnedCase[]` for every `OWNED_PATH` entry in the `addresses` and `account` modules (GET/PUT/PATCH/DELETE on address, PUT default, GET/DELETE on session).
- **`describe('every id a customer can send is classified…')`** — four completeness assertions: no unclassified ID, no stale list entry, no duplicate across families, no untyped `*Id` field outside the `NOT_AN_ID_BY_NAME` allow-list.
- **`describe('another customer's saved address…')`** — runs each case through `judge`, asserting all return 404 and that the victim's rows are unchanged (compares address list and session IDs only, since `lastUsedAt` mutates on read).

## Relationships

- **`src/kernel/ability.ts`** — `holds` is used to verify the customer role satisfies every permission a route requires, defining the "customer-reachable" set.
- **`tests/support/callers.ts`** — `callerAs('customer')` supplies the caller identity for those permission checks.
- **`tests/support/contract-routes.ts`** — `everyMountedRoute()` provides the full route inventory the completeness derivation iterates over.
- **`tests/support/contract.ts`** — imported for its side-effect (registers contract-test globals/conventions).
- **`tests/support/http.ts`** — `api`, `authenticateAs`, `authenticateAsRole` drive all HTTP traffic in both seeding and the sweep.
- **`tests/support/ids.ts`** — `MISSING_ID` is the sentinel ID used for the "nonexistent" comparison leg of each case.
- **`tests/support/owned-ids.ts`** — `FAMILIES`, `OWNED_PATH`, `NOT_AN_ID_BY_NAME`, and the `OwnedId` type are the single source of truth the test cross-checks against its derived set.
- **`tests/support/ownership-sweep.ts`** — `judge` executes each `OwnedCase` (foreign vs. missing) and returns problems; `Verb` type is used to parse the method from a key.
- **`tests/support/paths.ts`** — `isDeployed` filters list entries to modules present in the current checkout.
- **`tests/support/routes.ts`** — `identityGuardIndex` identifies routes that carry an identity guard (the prerequisite for ownership to be in scope).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` prepares the test database before any test runs.
- **`tests/support/spec-walk.ts`** — `readSpec` and `SchemaNode` provide access to the parsed `openapi.yaml`; this file reads the *raw* node (with `$ref` names) rather than the resolved walk, because the match on `#/components/schemas/Id` depends on the ref string.

## Notes

- **Scope split:** This file covers the *foundation* families (addresses + account/sessions). The *shop* families live in `ownership-shop.contract.test.ts` so that `demo:remove` strips only the shop half. `authorization-contract.test.ts` covers a different axis (role→route reachability, not row ownership).
- **Trailing-slash convention:** Modules mount their root with a trailing slash (`/orders/`); contract and `owned-ids` keys omit it. `withoutTrailingSlash` normalises before comparison.
- **Raw vs. resolved spec:** `propertiesOf` intentionally walks the raw schema bundle (preserving `$ref` strings) rather than the resolved form from `spec-walk.ts`, because the ID-typed match keys on the literal `#/components/schemas/Id` ref.
- **Session comparison:** `lastUsedAt` changes whenever the victim reads their own sessions, so the "victim unchanged" assertion compares only session `id` values, not the full object.
- **Verb extraction:** `at()` derives the HTTP verb by taking the first whitespace-delimited token of the key string (`'GET /account/…'` → `'GET'`); this relies on keys always starting with the verb.
