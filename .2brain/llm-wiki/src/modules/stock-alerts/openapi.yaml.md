---
source: src/modules/stock-alerts/openapi.yaml
sha256: 391dbd58a69c8adec05117ca47721b7861f10f6f8b6c802f5209289ab8217781
generated_at: 2026-11-08T08:29:05.862631+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the stock-alerts module. Defines the HTTP surface for creating, listing, and canceling back-in-stock alert requests, plus the module's contribution to the account data export. Serves as the single source of truth for the API shape that clients and the server implementation both rely on.

## Key elements

- **`tags.StockAlerts`** — the tag for all operations in this module; carries `x-family: Catalogue` for grouping.
- **`x-error-codes.STOCK_ALERT_PRODUCT_BUYABLE`** (409) — module-level error: the product is already buyable, so the alert is meaningless.
- **`x-personal-data.stockAlerts`** — schema fragment the bundler injects into `POST /account/export` as the `stockAlerts` section; removing this key removes the section from the export.
- **`GET /stock-alerts`** (`listStockAlerts`) — returns the caller's open alerts, newest first; answered alerts are deleted server-side so they never appear here.
- **`POST /stock-alerts`** (`createStockAlert`) — records an alert for one product; idempotent (second call returns the same 200 list). Returns 409 if the product is buyable now, 404 if hidden/deleted, 422 for a bad `productId`.
- **`DELETE /stock-alerts/{productId}`** (`deleteStockAlert`) — cancels the caller's own alert; returns 404 if the caller does not hold that alert (stale-client signal).
- **Schemas** — `CreateStockAlertRequest` (single `productId`), `StockAlert` (`productId` + `createdAt`), `StockAlertsResponse` (wraps an `items` array of `StockAlert`).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All common error responses (`Unauthorized`, `NotFound`, `Conflict`, `ValidationError`), the `ProductIdPathParam`, and the `Id` schema are referenced from this file via relative `$ref` paths. This file does not redefine those; it composes them.
- **`src/modules/stock-alerts/module.ts`** — Registers the module; this YAML is the contract it exposes (likely loaded/bundled by the module runtime).
- **`src/modules/stock-alerts/module.yaml`** — Module metadata/configuration; this OpenAPI file is the API-contract half of that pairing.

## Notes

- The `200` response on POST returns the **full list** (not just the created alert) — the list is the parent resource; an individual alert has no standalone URL.
- "Answered" alerts are **deleted**, not archived; there is no way to retrieve a past alert via this API.
- `GET /stock-alerts` deliberately never returns 404 — an empty list and a missing resource are the same state.
- All `401`/`404`/`409`/`422` responses are `$ref`-ed from `shared/contracts/openapi.root.yaml` rather than defined locally; keep relative paths in sync if the directory structure changes.
- The `x-personal-data` block is **consumed by a bundler** at build time; it is not part of the live API spec served to clients.
