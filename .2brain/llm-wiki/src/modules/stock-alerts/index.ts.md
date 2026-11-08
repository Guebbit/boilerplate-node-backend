---
source: src/modules/stock-alerts/index.ts
sha256: 9d8474634f9bcf576301d2acfdca9141e74860edd8c9503dcde44e9967696eee
generated_at: 2026-11-08T08:28:11.898014+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/index.ts

## Purpose

Public barrel (module facade) for the **stock-alerts** bounded context. It is the *only* import surface that sibling modules are permitted to use, enforcing the strategic-DDD encapsulation rule described in `docs/theory/strategic-ddd.md` §5.

## Key elements

- `export * from './service'` — re-exports all value and type members of the stock-alerts service.
- `export * from './events'` — re-exports all event definitions (domain events emitted by this context).
- `export * from './emails'` — re-exports email/notice-related helpers and templates.
- `export type * from './model'` — re-exports **types only** (no runtime values) from the module's model layer.

## Relationships

- **`src/modules/stock-alerts/service.ts`, `events.ts`, `emails.ts`, `model.ts`** — direct re-export targets; this file is their sole public gateway.
- **`src/modules/shop-tasks/module.ts`** — sibling module; per the DDD rule it must import stock-alerts exports *through* this barrel rather than reaching into internal files.
- **`src/modules/shop-tasks/tests/integration/notices.test.ts`** — integration tests that exercise cross-module notice/alert flows via this public surface.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — unit tests that import email template exports (re-exported here from `emails.ts`).

## Notes

- `model.ts` is intentionally exported with `export type *` (type-only), while the other three use plain `export *`. This keeps the model layer out of the runtime bundle for consumers that only need its types.
- Do **not** add direct imports of `./service`, `./events`, `./emails`, or `./model` in sibling modules; always go through this barrel. That is the enforcement point for the module boundary.
