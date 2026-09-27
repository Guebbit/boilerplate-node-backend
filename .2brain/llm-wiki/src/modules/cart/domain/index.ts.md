---
source: src/modules/cart/domain/index.ts
sha256: 435e1e15ed258b669fbf6aee8d25075631c0894e340b1877ac695ad592db250a
generated_at: 2026-09-27T14:44:14.302280+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/index.ts

## Purpose

Barrel file for the cart domain layer. It re-exports the public API of the domain (pure business rules and their associated types) from `./rules`, giving consumers a single import path while keeping the domain layer free of framework dependencies.

## Key elements

- **`evaluateCheckout`** (function, re-exported from `./rules`) — presumably validates/evaluates a checkout request.
- **`basketWeight`** (function, re-exported from `./rules`) — presumably computes a weight value for a cart basket.
- **`needsShipping`** (function, re-exported from `./rules`) — presumably determines whether a given cart requires shipping.
- **`evaluateShippingRequirement`** (function, re-exported from `./rules`) — presumably checks a shipping requirement and returns a verdict.
- **`CheckoutShortfall`** (type) — represents a shortfall condition on checkout.
- **`UnavailableCartLine`** (type) — represents a cart line that is unavailable.
- **`ShippingRequirementVerdict`** (type) — the result/verdict of a shipping-requirement evaluation.

## Relationships

- **`src/modules/cart/domain/rules.ts`** — sole source of every symbol re-exported here; this file adds no logic of its own.
- **`src/modules/cart/index.ts`** — the module-level public entry point; expected to import the domain API through this file.
- **`src/modules/cart/services/checkout.ts`**, **`services/items.ts`**, **`services/view.ts`** — service-layer consumers that import the domain functions/types via this barrel path.

## Notes

- This file contains **no executable logic**—it is purely a re-export barrel. Any behavior changes belong in `./rules.ts`.
- The doc-comment references `docs/theory/domain-layer.md` for the layering contract (pure rules, lint-guaranteed framework-free). That invariant applies to everything re-exported here.
