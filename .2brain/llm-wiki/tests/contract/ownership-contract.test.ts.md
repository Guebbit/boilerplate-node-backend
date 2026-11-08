---
source: tests/contract/ownership-contract.test.ts
sha256: c602f9282311bf93d54a46176081a27cdd904e50e99e29c3699f42dbad5e11aa
generated_at: 2026-11-08T09:19:41.265638+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/ownership-contract.test.ts

## Purpose

Contract test that enforces two invariants about IDOR defense: **completeness** — every customer-reachable ID in a URL path, request body, or query parameter is classified in exactly one ownership list (derived live from mounted routes + `openapi.yaml`, never hand-written) — and **the sweep** — for the foundation families (saved addresses, login sessions, notifications), a foreign ID in the URL or body returns 404, identical to a missing ID. This is the ownership half; `authorization-contract.test.ts` covers the permission half (role → route reachability).

## Key elements

- **`ID_REF`** — string constant `#/components/schemas/Id`; the single marker that a schema node represents an owned-row identifier.
- **`propertiesOf(node, prefix, trail)`** — recursively walks a raw OpenAPI schema (following `allOf`/`oneOf`/`anyOf`, `items`, nested `properties`) and returns every leaf property with its dot-path name and whether it resolves to `Id`. The `trail` array guards against self-referencing schemas.
- **`requestProperties(path, method)`** — reads the operation's `requestBody` and query `parameters` from the spec and returns the flattened `Found[]` list.
- **`customerRoutes`** — `everyMountedRoute()` filtered to routes with an identity guard whose permissions a customer caller holds (via `holds` from `@kernel/ability`).
- **`derive()`** — walks `customerRoutes`, normalises trailing slashes, converts `:param` to `{param}` for spec lookup, and returns `{ keys, untyped }`: all derived keys plus any `*Id`-named property that is *not* typed `Id`.
- **`seedFoundation()`** — creates a victim's address, captures their session ID, and creates a notification (via `createNotification`); returns the IDs and bearer tokens for both victim and attacker.
- **`foundationCases(world)`** — maps the victim's IDs into an `OwnedCase[]` (one per `OWNED_PATH` entry for `addresses`, `account`, `notifications`), each expecting `404` when aimed at a foreign ID.
- **Completeness `describe` block** — four assertions: no derived key missing from a list, no stale list entry, no duplicate key, no untyped `*Id` property outside the `NOT_AN_ID_BY_NAME` allow-list.
- **Sweep `describe` block** — seeds, runs `judge` over every case while a `watch` closure re-reads the victim's rows, and asserts no problems and that the case set matches the deployed `OWNED_PATH` entries.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/ability.ts` | `holds(callerAs('customer'), …)` decides which routes are customer-reachable. |
| `src/modules/notifications/tests/factories.ts` | `createNotification` seeds the victim's notification row. |
| `tests/support/callers.ts` | `callerAs('customer')` builds the ability-check subject. |
| `tests/support/contract-routes.ts` | `everyMountedRoute()` supplies the full route table. |
| `tests/support/contract.ts` | Side-effect import (shared contract-test setup). |
| `tests/support/http.ts` | `api`, `authenticateAs`, `authenticateAsRole` drive all HTTP calls. |
| `tests/support/ids.ts` | `MISSING_ID` used as the "no id" aim in the sweep. |
| `tests/support/owned-ids.ts` | `FAMILIES`, `NOT_AN_ID_BY_NAME`, `OWNED_PATH`, `OwnedId` define the ownership lists this test validates. |
| `tests/support/ownership-sweep.ts` | `judge`, `OwnedCase`, `Verb` provide the sweep harness and case shape. |
| `tests/support/paths.ts` | `isDeployed` filters list entries to modules still present in this checkout. |
| `tests/support/routes.ts` | `identityGuardIndex` identifies routes behind an auth guard. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the test database. |
| `tests/support/spec-walk.ts` | `readSpec()` and `SchemaNode` type supply the raw OpenAPI bundle and node shape. |

## Notes

- The schema walk here deliberately uses the **raw** bundle (with `$ref` strings intact) rather than the resolved walk in `spec-walk.ts`, because the match on `ID_REF` needs the `$ref` name.
- Shop-family cases live in `ownership-shop.contract.test.ts`; this file only covers `addresses`, `account`, and `notifications`, so `demo:remove` can strip the shop half independently.
- The session `watch` compares only session **IDs**, not the full object, because `lastUsedAt` mutates on the victim's own reads during the test.
- `withoutTrailingSlash` normalises the one-character gap between how modules mount their root (`/orders/`) and how the contract spec writes it (`/orders`).
- The verb in each `OwnedCase` is extracted as the first word of the key string; this relies on the convention that every key starts with an HTTP verb.
