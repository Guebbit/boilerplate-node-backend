---
source: tests/integration/security-events.test.ts
sha256: 878a6f356dd28057061338481acabb99357088255517b093a83c3a5e2ef14981
generated_at: 2026-10-29T07:03:24.672191+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/security-events.test.ts

## Purpose

Integration test suite that verifies the application's audit-logging behavior when a credential is refused over real HTTP. It distinguishes between two response classes: **forged/attacker credentials** (recorded as `security.*` audit actions) and **stale/expired credentials** (recorded only as a `staleCredentialsTotal` metric). One test per security event type ensures each audit door is exercised independently.

## Key elements

- **`audited(spy)`** — helper that flattens `auditLogger.log` spy mock calls into `{ action, metadata }[]` objects (reads the 3rd argument of each call).
- **`deliver(body, signature)`** — helper that POSTs a raw string body to `/payments/webhook/fake` with a `WEBHOOK_SIGNATURE_HEADER` value.
- **`describe('a refused bearer JWT')`** — covers three cases: non-JWT garbage (→ `SECURITY_TOKEN_MALFORMED`), tampered signature (→ `SECURITY_TOKEN_INVALID_SIGNATURE`), and expired token (→ metric only, no audit action).
- **`describe('a refused sk_ credential')`** — covers a revoked-but-real API key (→ `SECURITY_API_KEY_REVOKED`) and a well-formed but unknown key (→ `SECURITY_TOKEN_INVALID_SIGNATURE`).
- **`describe('a refused payment webhook')`** — covers a signature that doesn't verify (→ `SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE`), a non-signature header (same action), and a correctly-signed but unparseable body (no audit action; left to the general log).
- **`describe('a wrong metrics token')`** — covers a guessed bearer token (→ `SECURITY_METRICS_TOKEN_INVALID`) and a completely absent token (no audit action).
- **`auditSpy`** — module-level `jest.SpyInstance` on `auditLogger.log`, created in `beforeEach` and restored in `afterEach`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/adapters/logger.ts` | Spies on `auditLogger.log` to capture every audit entry the app emits during each request. |
| `src/infrastructure/observability/audit.ts` | Imports `coreAuditActions` (enum of audit action strings) for assertions. |
| `src/modules/payments/audit.ts` | Imports `paymentsAuditActions` for webhook-related assertions. |
| `src/modules/observability/audit.ts` | Imports `observabilityAuditActions` for metrics-token assertions. |
| `src/infrastructure/observability/security-events.ts` | Imports `staleCredentialsTotal` (a counter) to assert that expired tokens increment the metric rather than the audit log. |
| `src/modules/api-keys/repository.ts` | Imports `apiKeyRepository` to mint and revoke keys used in the API-key test cases. |
| `src/modules/payments/providers/index.ts` | Imports `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER` to forge/verify webhook signatures in tests. |
| `tests/support/http.ts` | Imports `api()` (supertest instance) and `authenticateAs()` (helper to obtain a valid bearer token). |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` once at module load to prepare a clean database. |
| `tests/support/clock.ts` | Imports `freezeDate` / `advanceDate` to simulate token expiry in the expired-JWT test. |
| `tests/support/credentials.ts` | Imports `credentialHolding` to mint a scoped API key for revocation testing. |
| `tests/support/environment.ts` | Imports `withEnvironmentOverrides` to temporarily set `NODE_METRICS_TOKEN` for the metrics tests. |

## Notes

- **Audit vs. metric split is intentional and tested explicitly.** An expired JWT must *not* appear as `SECURITY_TOKEN_INVALID_SIGNATURE`; it must *only* bump `staleCredentialsTotal`. The test asserts both sides of that boundary.
- **A correctly-signed but unparseable webhook body is *not* an invalid-signature event.** The test asserts the security audit action is *absent* — the failure is expected to surface only in the general application log.
- **A missing metrics token (no `Authorization` header at all) is *not* audited.** Only a present-but-wrong token triggers `SECURITY_METRICS_TOKEN_INVALID`.
- The `audited()` helper assumes the audit entry is always the **third** positional argument (`call[2]`) of `auditLogger.log`. If the logger signature changes, this helper breaks silently.
- `setupTestDb()` runs at module scope (not in a hook), so the database is ready before any `describe` block executes.
- The test file imports `coreAuditActions` from `@infrastructure/observability/audit`, `paymentsAuditActions` from `@modules/payments/audit`, and `observabilityAuditActions` from `@modules/observability/audit` — three separate enums that together cover every `security.*` action asserted in this file.
