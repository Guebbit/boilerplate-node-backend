---
source: src/modules/observability/audit.ts
source_sha256: 34511235049f76cb61780a653704286d86312ed52302a6e4b5ade7b86f3efabb
context_sha256: c81c985c44c6f303a7da81248a5fd4f53e73247a88cc436305ebe8363f0dd137
generated_at: 2026-11-22T06:00:08.902802+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/audit.ts

## Purpose
Declares the audit action strings emitted by the observability module and registers them with the infrastructure layer. It does this by augmenting infrastructure's `AuditActionMap` type rather than editing infrastructure directly. The only action covers an attack on the scrape credential: a `/observability/metrics` scrape with the wrong bearer token.

## Key elements
- `observabilityAuditActions`: a `const` object of audit action strings keyed by event. It has one entry, `SECURITY_METRICS_TOKEN_INVALID`, whose value is `'security.metrics_token.invalid'`.
- `registerSecurityEvents([...])`: called at module load with `SECURITY_METRICS_TOKEN_INVALID`, so that action is registered as a security event.
- `declare module '@infrastructure/observability/audit'`: adds an `observability` key to `AuditActionMap`. Its type is the union of the values in `observabilityAuditActions`.

## Relationships
- **`src/infrastructure/observability/security-events.ts`**: provides `registerSecurityEvents`, which this file imports and calls.
- **`@infrastructure/observability/audit`**: the module whose `AuditActionMap` is augmented. It is not in the neighbor list, but the file names it directly.
- **`src/modules/observability/metrics-scraper.ts`**: a neighbor in the dependency graph. The action's description refers to the metrics scrape endpoint. This file does not import the scraper, so the nature of the link is not visible here.
- **`tests/integration/security-events.test.ts`**: a neighbor in the dependency graph, most likely covering security-event registration. The file shows nothing more about it.

## Notes
- Registration is a side effect of importing this file, so the module must be loaded for the action to be registered as a security event.
- The file's header comment points to `src/modules/account/audit.ts` for the reasoning behind the augmentation pattern.
