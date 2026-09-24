---
source: src/modules/webhooks/index.ts
sha256: 13c3e221d6a4acf8839f2af0ec3eeacab1b68645f485c82bd69b71324052bbd1
generated_at: 2026-09-23T19:40:02.070357+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/index.ts

## Purpose

Public barrel for the webhooks module. It is the **only** import surface permitted to sibling modules (enforced per `docs/theory/strategic-ddd.md` §5). It re-exports the module's public API without executing any side-effects.

## Key elements

- **`export * from './services'`** — re-exports all service-level functions/classes (delivery orchestration, retry logic, etc.).
- **`export * from './domain'`** — re-exports domain events, aggregates, and value objects.
- **`export * from './emails'`** — re-exports email/notification helpers tied to webhook lifecycle.
- **`export type * from './model'`** — re-exports **type-only** declarations (interfaces, type aliases) from the persistence model layer.

The file exports no values of its own and defines no runtime code.

## Relationships

- **`src/modules/webhooks/services/index.ts`**, **`src/modules/webhooks/domain/index.ts`**, **`src/modules/webhooks/emails.ts`**, **`src/modules/webhooks/model.ts`** — direct re-export sources; this barrel is their sole public façade.
- **`scripts/ops/sweep-webhook-retries.ts`** — operational script that consumes services exposed through this barrel to sweep pending webhook retries.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — unit test that imports email template helpers from this barrel to assert rendered output.

## Notes

- **`module.ts` is intentionally NOT re-exported here.** It declares the domain-event subscription and the queue consumer on its own manifest entry; neither runs at import time. Siblings must not (and cannot) pull these through the barrel.
- **`secrets.ts` is internal by design.** Signing/encrypting a delivery secret is module-private; it is deliberately absent from this barrel.
- The `model` re-export uses `export type *` (type-only). Importing a value from `./model` via this barrel will fail at compile time.
- See `docs/modules/webhooks.md` for the module's full design narrative.
