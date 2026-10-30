---
source: src/modules/observability/audit.ts
sha256: 34511235049f76cb61780a653704286d86312ed52302a6e4b5ade7b86f3efabb
generated_at: 2026-10-29T04:34:51.648190+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/audit.ts

## Purpose

Declares and registers the audit action strings that the observability module can emit, and augments the shared infrastructure `AuditActionMap` type so those strings are available across the codebase. It exists to follow the per-module audit registration pattern (same pattern as `modules/account/audit.ts`) so each module owns its action vocabulary.

## Key elements

- **`observabilityAuditActions`** (exported const object) — Single action: `SECURITY_METRICS_TOKEN_INVALID` (`'security.metrics_token.invalid'`), representing a `/observability/metrics` scrape presenting the wrong bearer token.
- **`registerSecurityEvents([...])`** (imported call) — Registers the action string with the infrastructure security-events registry at module load time.
- **`declare module '@infrastructure/observability/audit'`** (module augmentation) — Adds an `observability` key to the `AuditActionMap` interface so other files can reference `AuditActionMap['observability']` in a type-safe way.

## Relationships

- **`src/infrastructure/observability/security-events.ts`** — Provides `registerSecurityEvents`, which this file calls to register its action string with the global security-events system.
- **`src/modules/observability/metrics-scraper.ts`** — The runtime component that would trigger `SECURITY_METRICS_TOKEN_INVALID` when a scrape request carries an invalid token (the action this file declares).
- **`tests/integration/security-events.test.ts`** — Integration tests that exercise the security-events registry, which includes the action registered here.

## Notes

- The file has no runtime logic beyond the single `registerSecurityEvents` call; its primary purpose is the type-level module augmentation.
- The action-string convention is `security.<domain>.<event>` — new actions in this file should follow that shape.
- The `as const` on `observabilityAuditActions` is load-bearing: the augmentation uses `(typeof observabilityAuditActions)[keyof typeof observabilityAuditActions]` to derive the literal union type.
