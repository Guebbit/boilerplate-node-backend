---
source: src/infrastructure/observability/security-events.ts
sha256: 216a692f1d35eab5e9881a3e6df65a8a2c28662ee0e5158a72fe92af9596f39e
generated_at: 2026-10-29T02:11:27.885429+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/security-events.ts

## Purpose

Pairs every `security.*` audit log entry with a Prometheus counter so that the audit trail (evidence) and the rate-based alert rule (signal) can never disagree on event counts. It is the single choke-point for incrementing security metrics and writing their corresponding audit records.

## Key elements

- **`securityEventsTotal`** – `Counter` (from `prom-client`) labeled `{ event }`. One series per `security.*` action. Registered against `metricsRegistry`.
- **`staleCredentialsTotal`** – `Counter` for refused expired/revoked sessions and keys. Metric-only by design (FE token churn is too noisy to audit).
- **`SecurityEventAction`** – `Extract<AuditAction, \`security.${string}\`>`; the closed set of valid label values, preventing unbounded cardinality from request data.
- **`registerSecurityEvents(actions)`** – Pre-sets each action's series to 0 so Prometheus `increase()` alerts fire correctly after a restart. Called by modules to seed their own `security.*` actions.
- **`recordSecurityEvent(context, action, metadata?)`** – Increments `securityEventsTotal` and calls `recordAudit` in the same synchronous call. Actor is always `anonymous` / `failure`.

## Relationships

- **`./audit`** – Imports `recordAudit` (writes the log entry), `coreAuditActions` (the built-in `security.*` action constants), and the `AuditAction` type.
- **`./metrics-registry`** – Provides the shared `Registry` instance the counters register into.
- **`./metric-config`** – `counterConfig` supplies the label/help/name defaults for each counter.
- **`./metrics.generated`** – `infrastructureMetricData.securityEventsTotal` / `.staleCredentialsTotal` carry the static metric metadata (name, help, labels).
- **`@types`** – `CallerContext` type used as the first argument to `recordSecurityEvent`.
- **`src/kernel/middlewares/authorizations.ts`** – Primary caller; invokes `recordSecurityEvent` when a token signature is invalid, a token is malformed, or an API key is revoked.
- **`src/modules/observability/audit.ts`** – Registers module-specific `security.*` actions via `registerSecurityEvents` before they can be recorded.
- **`src/modules/payments/audit.ts`** – Same pattern: seeds payment-specific security actions into the shared counter.
- **`src/modules/observability/metrics-scraper.ts`** – Exports the `metricsRegistry` (which holds these counters) to the Prometheus scrape endpoint.
- **`tests/integration/security-events.test.ts`** – End-to-end assertions that a refused request produces both the counter increment and the audit entry.
- **`tests/unit/kernel/authorizations.test.ts`** – Unit-tests that the authorization middleware calls `recordSecurityEvent` with the expected action.

## Notes

- `actorUserId` and `actorRole` are hardcoded to `'anonymous'` inside `recordSecurityEvent`; these events occur before (or instead of) successful auth, so there is no real user to attribute.
- `staleCredentialsTotal` intentionally has **no** accompanying `recordAudit` call—deliberate, not an oversight.
- The label value is constrained by the `SecurityEventAction` type at compile time; passing an arbitrary string would be a type error. This is the cardinality guard.
- `registerSecurityEvents` is idempotent: calling it twice with the same action simply sets the series to 0 again before the first real `inc()`.
