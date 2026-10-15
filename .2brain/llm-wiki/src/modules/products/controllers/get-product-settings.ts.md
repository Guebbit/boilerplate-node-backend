---
source: src/modules/products/controllers/get-product-settings.ts
sha256: 25d64f404f344d365c34d8249f308a60cbaff3accad1b033b71f0e110d36cb6d
generated_at: 2026-10-15T11:40:37.326419+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-product-settings.ts

## Purpose

A single-purpose GET controller that exposes the shop's configured currency as the catalogue's public "settings." It exists so client code (e.g., a product-creation form) can size its price input from a canonical currency value before any individual product carries its own `currency` field.

## Key elements

- **`getProductSettings`** (exported) — Express handler for `GET /products/settings`. Calls `productCurrency()` and wraps the result in a `ProductSettingsResponse` (`{ currency }`) via the shared `successResponse` helper.

## Relationships

- **`src/modules/products/config.ts`** — Source of truth for the currency value (`productCurrency`). The controller has no other way to obtain the setting.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard envelope the controller uses to serialise the reply.
- **`src/modules/products/routes.ts`** — Declares the `GET /products/settings` route and wires it to this controller.
- **`src/types/index.ts`** — Defines `ProductSettingsResponse`, the shape the controller commits to in its response body.

## Notes

- The controller is intentionally stateless and argument-agnostic (`_request` is unused); all data comes from the module config, not from the request.
- "Today only the shop's currency" — the settings object is a single-key record. If new settings are added later, the `ProductSettingsResponse` type in `@types` is the place to extend, not this file.
