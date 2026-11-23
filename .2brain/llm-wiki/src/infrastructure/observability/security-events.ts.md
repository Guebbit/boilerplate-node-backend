---
source: src/infrastructure/observability/security-events.ts
source_sha256: 0b1c25ef864aad9aaca00617ddc364958a1ac786fae9a37f0bfbf276516e1b59
context_sha256: 3479931a8d68a98f717ec674114a4a3a8a294a94bf1ae7e015f32964af860b3c
generated_at: 2026-11-22T03:00:36.837127+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/security-events.ts

## Purpose
Pairs each `security.*` audit action that names an attack on a credential with a Prometheus counter. The audit entry is the evidence and the counter is what an alert rule can watch. Both are emitted together in one call, so the log and the metric cannot disagree on how many events occurred.

## Key elements
- `securityEventsTotal`: a `prom-client` `Counter` registered on `metricsRegistry`, labelled by `event`. The label is the audit action string and is bounded by `SecurityEventAction`, never request data.
- `staleCredentialsTotal`: a `Counter` for refused credentials a customer plausibly still holds, such as expired or revoked sessions and keys. It is a counter plus a log line only, with no stored audit row.
- `SecurityEventAction`: a type, the `security.*` subset of `AuditAction`. It covers the guards' own actions plus any a module declares and registers.
- `registerSecurityEvents(actions)`: increments each action's series by 0, so an `increase()` alert sees the first event after a restart. A module that records an attack calls it from its own `audit.ts`.
- `recordSecurityEvent(context, action, metadata?)`: increments `securityEventsTotal` for the action, then calls `recordAudit`. The audit entry has actor user and role `'anonymous'`, outcome `'failure'`, and optional `metadata`.

## Relationships
- `src/infrastructure/observability/audit.ts` provides `recordAudit`, `coreAuditActions` and the `AuditAction` type.
- `src/infrastructure/observability/metrics-registry.ts` provides `metricsRegistry`, where both counters register.
- `src/infrastructure/observability/metric-config.ts` provides `counterConfig`, which builds the counter options for both counters.
- `src/types/index.ts` provides `CallerContext` (imported via `@types`). `src/types/auth-context.ts` is a neighbor, but this file does not show how it relates.
- Per the header comment, other modules' `audit.ts` files (such as `src/modules/observability/audit.ts` and `src/modules/payments/audit.ts`) call `registerSecurityEvents` for their own `security.*` actions. The visible code does not show which modules actually do.
- `src/kernel/middlewares/authorizations.ts` is a graph neighbor. The file itself does not show how it uses this module.

## Notes
- At import time, the module pre-registers `SECURITY_TOKEN_INVALID_SIGNATURE`, `SECURITY_TOKEN_MALFORMED` and `SECURITY_API_KEY_REVOKED`.
- `recordSecurityEvent` always records the actor as anonymous, so it fits refused requests that have no authenticated identity.
- `staleCredentialsTotal` is only declared and exported here. No increment helper exists in this file.
