---
source: src/modules/cart/domain/index.ts
sha256: 119a0554c0831b98e4f586f7d674cb44c96f04d6fab5df82c5aaa248ae0ca6af
generated_at: 2026-09-23T18:30:01.272953+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/index.ts

## Purpose

Barrel entry point for the cart domain layer. It re-exports the pure business rules so that consumers can import from a stable, framework-free path without reaching into individual rule files.

## Key elements

- **`evaluateCheckout`** — re-exported from `./rules`; performs the checkout evaluation logic.
- **`basketWeight`** — re-exported from `./rules`; calculates the weight of the basket.

## Relationships

- **`src/modules/cart/domain/rules.ts`** — sole source of both re-exports; this file adds no logic of its own.
- **`src/modules/cart/index.ts`** — the module's public entry point; imports the domain layer through this index.
- **`src/modules/cart/services/checkout.ts`** — service-layer consumer that pulls `evaluateCheckout` (and possibly `basketWeight`) from this barrel.

## Notes

- The domain layer is enforced as framework-free by lint rules (see `docs/theory/domain-layer.md`). Avoid importing React, Node, or other runtime dependencies through this path.
- Because this file is a pure re-export, adding a new rule means updating both `rules.ts` _and_ this barrel's export list.
