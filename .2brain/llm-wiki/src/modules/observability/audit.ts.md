---
source: src/modules/observability/audit.ts
sha256: 34511235049f76cb61780a653704286d86312ed52302a6e4b5ade7b86f3efabb
generated_at: 2026-11-08T06:37:52.131480+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/audit.ts

## Purpose

Declares the observability module's security-audit action strings and registers them with the infrastructure security-events system. Currently defines a single action for detecting invalid bearer tokens on `/observability/metrics` scrapes. Follows the same "module-local action map + infrastructure registration" pattern as `modules/account/audit.ts`.

## Key elements

- **`observabilityAuditActions`** (exported const) — Object holding the module's audit action string literals. Contains one key:
  - `SECURITY_METRICS_TOKEN_INVALID` (`'security.metrics_token.invalid'`) — fired when a metrics scrape presents the wrong bearer token.
- **`registerSecurityEvents([...])`** — Call that pushes the action into the infrastructure-level registry so it is recognised globally.
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — Adds an `observability` key to the shared `AuditActionMap` interface, typed as a union of this module's action values.

## Relationships

- **`src/infrastructure/observability/security-events.ts`** — Provides `registerSecurityEvents`, which this file imports and calls to publish its action string(s) to the central registry.
- **`src/modules/observability/metrics-scraper.ts`** — The runtime consumer that emits `SECURITY_METRICS_TOKEN_INVALID` when a scrape request fails bearer-token validation.
- **`tests/integration/security-events.test.ts`** — Integration tests that exercise the security-events pipeline, including this module's registered action.

## Notes

- The `as const` on `observabilityAuditActions` is what lets the module augmentation derive a precise string-literal union type for `AuditActionMap.observability` without repeating the values.
- Adding a new audit action to this module requires: (1) adding a key/value to `observabilityAuditActions`, (2) including it in the `registerSecurityEvents([...])` array. Forgetting either step silently breaks either the type contract or the runtime registry.
