---
source: src/modules/wishlist/config.ts
sha256: f46adc204c7509689783370503bc58a5d363a5e1f5a24d7f972fe6b6b3a216b9
generated_at: 2026-11-14T22:52:26.629814+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/config.ts

## Purpose

Defines the single tunable for the wishlist module — the maximum number of products a single list may hold. It exists to keep `GET /wishlist` unpaginated yet bounded, exposing the value through a typed config object and a convenience getter.

## Key elements

- **`wishlistConfig`** — the config object built via `defineConfig`. Exposes one field, `NODE_WISHLIST_MAX` (`int`, default 250, clamped 1–250).
- **`wishlistMax(): number`** — reads the current value of `NODE_WISHLIST_MAX` from the config; the single public accessor other code uses.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, the function that assembles the `wishlistConfig` object with name, shape, and validation.
- **`src/infrastructure/config/fields.ts`** — provides the `int` field descriptor used to declare `NODE_WISHLIST_MAX` with its default, min, and max constraints.
- **`src/modules/wishlist/module.ts`** — consumes this file's exports to wire the cap into the wishlist's module-level behavior.
- **`src/modules/wishlist/repository.ts`** — calls `wishlistMax()` to enforce the line-count limit when creating or validating wishlist entries.

## Notes

- The `max: 250` cap is intentional: it guarantees the endpoint stays unpaginated regardless of what an operator sets. Raising the cap above 250 would break that invariant.
- The default (250) aligns with commercetools' own shopping-list limit and sits under Zalando's "few hundred" guideline (tracked as issue #159).
- Only one field exists; the file is deliberately a single-knob config. Adding fields here should be rare.
