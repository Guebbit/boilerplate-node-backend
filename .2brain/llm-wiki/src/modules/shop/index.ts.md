---
source: src/modules/shop/index.ts
sha256: 0d874ecdfeb691d48898d49239de807105971295c9e837df2beba60d22da17b6
generated_at: 2026-10-29T05:51:52.669179+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/index.ts

## Purpose

Public barrel for the shop module. It is the **only** surface a sibling module may import from, enforcing the module-boundary rule codified in `docs/theory/strategic-ddd.md` §5. All exports are re-exported from `./service`; nothing else (config, manifest) is exposed.

## Key elements

- `export * from './service'` — re-exports the shop service's public API. This is the entire export surface of the file.

## Relationships

- **Consumed by sibling modules** (cart, delivery, invoicing, orders) — their services, controllers, factories, and test suites import the shop service API through this barrel rather than reaching into internal shop files.
- **`./service`** (local) — the single re-export target; all named exports of the shop service become the shop module's public API.

## Notes

- The doc comment explicitly states that the config slice and manifest are **wiring** and are intentionally excluded from the barrel. Do not add them here.
- The canonical reference for the import rule is `docs/theory/strategic-ddd.md` §5; the module's own docs are at `docs/modules/shop.md`.
- Because this file is a pass-through, any change to `./service`'s exports automatically changes the public surface visible to all siblings — treat `./service` exports as a public contract.
