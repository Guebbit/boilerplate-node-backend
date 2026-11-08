---
source: src/modules/example/module.yaml
sha256: 09f7d1d21ef4865153987f08a8a896533dfbfb60712cff8feec6b2a4db04c4c5
generated_at: 2026-11-08T05:51:13.007351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/module.yaml

## Purpose

A declarative module definition that serves as a copy-paste scaffold for new domain modules. It declares the example note's metadata, its dependency on `users`, and the rate-limit policy for the creation endpoint. The summary explicitly marks it as disposable: delete it once you've forked the pattern into your own domain.

## Key elements

- **`summary`** – Human-readable description; doubles as the instruction to delete this module after forking.
- **`subdomain: generic` / `group: example`** – Classifies the module in the domain taxonomy.
- **`dependsOn: [users]`** – Declares a dependency on the `users` module for the owner's display name and the publish-mail recipient address.
- **`rateLimits.exampleCreate`** – Rate-limit policy for `POST /examples`:
  - `namespace: example-create`
  - `defaultMax: 30` over a `shared` window
  - Overridable via the `NODE_EXAMPLE_RATE_LIMIT_MAX` environment variable
  - `audited: true` – every spend is logged for audit.

## Relationships

- **`src/modules/example/module.ts`** – The TypeScript implementation that this YAML describes. The TS file provides the CRUD logic (draft → published → archived lifecycle) and the `POST /examples` handler; this file supplies its metadata, the `users` dependency contract, and the rate-limit configuration the handler enforces.

## Notes

- **Disposable by design.** The summary states this module should be deleted once you've created your own domain module. Don't extend it in production.
- **Shared window.** `windowMs: shared` means the 30-request budget is pooled (not per-user or per-IP). Verify the shared-window semantics in the rate-limit middleware before assuming per-key isolation.
- **Dependency on `users` is narrow.** Only the display name and the publish-mail address are consumed; the example module does not write to or otherwise mutate user records.
