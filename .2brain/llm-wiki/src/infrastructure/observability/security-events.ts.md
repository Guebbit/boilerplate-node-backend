---
source: src/infrastructure/observability/security-events.ts
sha256: 216a692f1d35eab5e9881a3e6df65a8a2c28662ee0e5158a72fe92af9596f39e
generated_at: 2026-11-08T03:41:19.735293+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/security-events.ts

## Purpose

Defines the `security.*` audit-action counters and the single recording function that pairs each counter increment with an audit log entry. It exists so that a rate-based alert (Prometheus `increase()`) and the forensic audit trail always agree on how many attacks occurred.

## Key elements

- **`securityEventsTotal`** (Counter) — the main counter, labelled by `event` (the audit-action string). Registered to the shared `metricsRegistry`.
- **`staleCredentialsTotal`** (Counter) — counts refused expired/revoked credentials. Metric-only by design (no paired audit entry) because frequent FE token expiry would flood the audit log.
- **`SecurityEventAction`** (type) — `Extract<AuditAction, 'security.${string}'>`; bounds the valid label values so they never leak request data.
- **`registerSecurityEvents(actions)`** — pre-sets each action's series to 0 (`inc(…, 0)`) so a post-restart `increase()` alert fires on the first event. Callers (module `audit.ts` files) invoke this to register their own `security.*` actions. Core actions (`TOKEN_INVALID_SIGNATURE`, `TOKEN_MALFORMED`, `API_KEY_REVOKED`) are registered at module load.
- **`recordSecurityEvent(context, action, metadata?)`** — increments `securityEventsTotal` and calls `recordAudit` with `actorUserId: 'anonymous'`, `actorRole: 'anonymous'`, `outcome: 'failure'`, and any extra metadata.

## Relationships

- **`src/infrastructure/observability/audit.ts`** — imports `recordAudit`, `coreAuditActions`, and the `AuditAction` base type; `SecurityEventAction` is a narrowed extraction of it. `recordSecurityEvent` delegates the log-write to `recordAudit`.
- **`src/infrastructure/observability/metrics-registry.ts`** — both counters register into the shared `metricsRegistry` instance.
- **`src/infrastructure/observability/metric-config.ts`** — provides `counterConfig()` to spread shared metric metadata (name, help, etc.) into each Counter constructor.
- **`src/types/index.ts`** — source of the `CallerContext` type accepted by `recordSecurityEvent`.

## Notes

- The counter and audit entry are emitted **together** in `recordSecurityEvent`; they are never written independently, so a rule and a log query will always match.
- `staleCredentialsTotal` is intentionally **not** paired with an audit entry — treat it as a volume signal, not an incident record.
- `registerSecurityEvents` must be called **before** the first `recordSecurityEvent` for a given action, or the Prometheus `increase()` function will treat the series as "missing" and the alert will miss the first event after a restart.
- The `event` label is always a compile-time-known `SecurityEventAction` value, never free-form request data — this keeps the cardinality bounded.
