---
source: src/infrastructure/observability/security-events.ts
sha256: 3ffbf5680aa8cf6da817f533155033ae804849f6338a023a3fb33a9122020e61
generated_at: 2026-10-14T08:07:27.329175+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/security-events.ts

## Purpose

Defines Prometheus counters for security-attack events (forged or guessed credentials) and pairs each increment with a structured audit log entry so the metric and the evidence can never disagree. The counters are rate-alertable; the audit lines are the forensic record.

## Key elements

- **`securityEventsTotal`** — `Counter` (`security_events_total`, label `event`). One series per attack type; label value is always a string from the bounded `coreAuditActions` set, never request data.
- **`staleCredentialsTotal`** — `Counter` (`auth_stale_credentials_total`, labels `kind`, `reason`). Tracks expired/revoked sessions and keys presented by legitimate customers. Metric-only; intentionally **not** audited because FE tokens expire every few minutes and auditing would be noise.
- **`SECURITY_EVENT_ACTIONS`** (module-private) — `readonly` tuple of the five `security.*` audit actions this module accepts. Pre-initialises each series to 0 at startup so `increase()` alerts fire on the very first post-restart event.
- **`SecurityEventAction`** (exported type) — Union of the five action strings; constrains what callers may pass.
- **`recordSecurityEvent(context, action, metadata?)`** — The single entry point. Increments `securityEventsTotal` **and** calls `recordAudit` in one synchronous call. Actor is always `anonymous`/`failure`; optional `metadata` (e.g. route) is merged into the audit entry.

## Relationships

- **`./audit.ts`** — Imports `recordAudit` (writes the audit line) and `coreAuditActions` (source of the bounded action strings).
- **`./metrics-registry.ts`** — Registers both counters against the shared `metricsRegistry` instance so they appear in the single `/metrics` endpoint.
- **`@types` (`CallerContext`)** — Typed parameter for the caller identity recorded in the audit entry.
- **`src/kernel/middlewares/authorizations.ts`** — Primary caller; emits token-signature, token-malformed, and API-key-revoked events during auth rejection.
- **`src/modules/payments/controllers/post-payment-webhook.ts`** — Emits `SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE` when a webhook payload fails verification.
- **`src/modules/observability/metrics-scraper.ts`** — Consumes the counter values for external monitoring/alerting.
- **`tests/integration/security-events.test.ts`** — End-to-end tests that exercise `recordSecurityEvent` through real middleware paths.
- **`tests/unit/kernel/authorizations.test.ts`** — Unit tests verifying the authorisation middleware calls `recordSecurityEvent` with the correct action.

## Notes

- `recordSecurityEvent` does **not** accept `staleCredentialsTotal`—that counter has no public setter in this file; callers must increment it directly. This is deliberate: stale-credential events are metric-only and skip audit.
- All series are pre-touched to 0 (`inc({...}, 0)` in a loop) at module load. Adding a new action to `SECURITY_EVENT_ACTIONS` automatically gets the same treatment; forgetting to do so for a *new* counter would break `increase()` alerts after a cold start.
- The `event` label is bounded by `coreAuditActions` (a fixed enum), keeping cardinality flat. Never pass free-form strings as the `action` parameter.
- `staleCredentialsTotal` labels are `kind` + `reason`, not `event`—do not confuse the two counters when writing PromQL.
