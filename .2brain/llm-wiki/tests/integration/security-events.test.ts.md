---
source: tests/integration/security-events.test.ts
sha256: 1b8001f690829e3fd6467f5c8a85b0c0787babfeac06a73296cae96bbf8b0083
generated_at: 2026-10-15T12:54:09.056358+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/security-events.test.ts

## Purpose

Integration tests that verify the audit-and-metrics behavior when the app refuses a credential. Each test drives a real HTTP request through the running app and asserts either that a `security.*` audit entry was written (forged or revoked credential = attack) or that only a stale-credential counter was incremented (expired session = noise, not an incident). One test per distinct refusal event.

## Key elements

- **`audited(spy)`** – Helper that pulls the third positional argument (the audit entry) from each call captured on the `auditLogger.log` spy.
- **`auditSpy`** – Jest spy installed in `beforeEach` on `auditLogger.log`; restored in `afterEach`.
- **`deliver(body, signature)`** – Helper that POSTs to `/payments/webhook` with a `Content-Type` and the webhook-signature header.
- **`describe('a refused bearer JWT')`** – Covers: non-JWT token → `SECURITY_TOKEN_MALFORMED`; tampered-signature JWT → `SECURITY_TOKEN_INVALID_SIGNATURE`; expired JWT → no audit entry, but `staleCredentialsTotal` counter incremented with `{ kind: 'session', reason: 'expired' }`.
- **`describe('a refused sk_ credential')`** – Covers: revoked API key → `SECURITY_API_KEY_REVOKED`; unknown well-formed key → `SECURITY_TOKEN_INVALID_SIGNATURE`.
- **`describe('a refused payment webhook')`** – Covers: signature that doesn't verify → `SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE`; garbage header → same action; correctly signed but non-JSON body → **no** invalid-signature audit (left to the log).
- **`describe('a wrong metrics token')`** – Covers: wrong Bearer token on `/observability/metrics` → `SECURITY_METRICS_TOKEN_INVALID`; missing token → no audit entry.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – The spy target; the test intercepts `auditLogger.log` to capture and assert on audit entries.
- **`src/infrastructure/observability/audit.ts`** – Source of the `coreAuditActions` enum whose values are the expected `action` strings in every assertion.
- **`src/infrastructure/observability/security-events.ts`** – Source of `staleCredentialsTotal`; the test resets it and reads `.values` to assert the expired-token counter.
- **`src/modules/api-keys/repository.ts`** – `apiKeyRepository.findAnyByPrefix` and `revokeMany` are used to set up and revoke API keys before hitting the endpoint.
- **`src/modules/payments/providers/index.ts`** (re-exports from `webhook-signature.ts`) – Provides `signWebhookPayload` and `WEBHOOK_SIGNATURE_HEADER`, used to forge valid and invalid signatures for the webhook tests.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` simulate 24 h passing so a previously-valid JWT is expired.
- **`tests/support/credentials.ts`** – `credentialHolding` mints an `sk_` API key with a given scope.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` sets `NODE_METRICS_TOKEN` for the metrics-endpoint tests.
- **`tests/support/http.ts`** – `api()` creates a supertest-style request; `authenticateAs('user')` returns a valid bearer JWT.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` (called at module top-level) ensures a clean database for the test run.

## Notes

- **Audit vs. metric boundary is the whole point of this file.** Forged/revoked credentials produce an audit entry; expired credentials only bump a counter. Tests explicitly assert the *absence* of the audit entry in the expired case.
- The audit entry is the **third** argument (`call[2]`) passed to `auditLogger.log`, not the first.
- `staleCredentialsTotal` must be `.reset()` before the assertion; it is a shared Prometheus-style counter and will otherwise accumulate across tests.
- The webhook "unparseable body" test is deliberately *not* an invalid-signature audit: a valid signature over a non-JSON payload is a routing/parsing error, not an attack.
- `authenticateAs` returns both `token` (raw JWT) and `bearer` (likely `Bearer <token>`); the expired-token test uses `bearer` directly in the `Authorization` header while the tampered-signature test manipulates `token` by splitting on dots.
