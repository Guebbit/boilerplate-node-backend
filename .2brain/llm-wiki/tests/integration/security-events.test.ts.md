---
source: tests/integration/security-events.test.ts
sha256: 878a6f356dd28057061338481acabb99357088255517b093a83c3a5e2ef14981
generated_at: 2026-11-08T09:48:28.885197+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/security-events.test.ts

## Purpose

Integration tests that verify the application correctly classifies and records credential-refusal events when driven over real HTTP. It asserts the boundary between **security attacks** (forged, tampered, or revoked credentials → audited via `security.*` actions) and **operational noise** (expired sessions, missing tokens → counted as a Prometheus metric or ignored). One test case per distinct refusal event.

## Key elements

- **`audited(spy)`** — Extracts the third argument (`{action, metadata}`) from every recorded call to the audit-logger spy.
- **`deliver(body, signature)`** — Helper that POSTs a raw body to `/payments/webhook/fake` with a `Content-Type` and `WEBHOOK_SIGNATURE_HEADER`.
- **`beforeEach` / `afterEach`** — Spies on `auditLogger.log`; restores the spy and real timers after each test.
- **`describe('a refused bearer JWT')`** — Covers malformed tokens, tampered signatures, and expired tokens (asserts *no* audit entry, only `staleCredentialsTotal` increment).
- **`describe('a refused sk_ credential')`** — Covers a revoked-but-real API key and a well-formed key nobody minted.
- **`describe('a refused payment webhook')`** — Covers a mismatched signature, a non-signature header value, and a correctly signed but unparseable JSON body.
- **`describe('a wrong metrics token')`** — Covers a guessed `NODE_METRICS_TOKEN` and a completely absent token.

## Relationships

| Neighbor | Role in this file |
|---|---|
| `tests/support/http.ts` (`api`, `authenticateAs`) | Drives real HTTP requests and mints valid bearer tokens. |
| `tests/support/setup-test-db.ts` (`setupTestDb`) | Initialises a fresh test database before the suite. |
| `tests/support/credentials.ts` (`credentialHolding`) | Creates a real API key with a given scope for the revocation test. |
| `tests/support/clock.ts` (`freezeDate`, `advanceDate`) | Freezes and advances the clock to simulate token expiry. |
| `tests/support/environment.ts` (`withEnvironmentOverrides`) | Temporarily sets `NODE_METRICS_TOKEN` for the metrics-scrape tests. |
| `src/infrastructure/adapters/logger.ts` (`auditLogger`) | **Spy target** — all assertions read from its `log` calls. |
| `src/modules/api-keys/repository.ts` (`apiKeyRepository`) | Looks up and revokes API keys to set up the revocation scenario. |
| `src/modules/payments/providers/index.ts` (`signWebhookPayload`, `WEBHOOK_SIGNATURE_HEADER`) | Produces valid/forged signatures for webhook tests. |
| `src/infrastructure/observability/audit.ts` (`coreAuditActions`) | Source of expected `SECURITY_*` action constants for JWT and API-key events. |
| `src/modules/payments/audit.ts` (`paymentsAuditActions`) | Expected action constants for webhook-signature failures. |
| `src/modules/observability/audit.ts` (`observabilityAuditActions`) | Expected action constant for the metrics-token refusal. |
| `src/infrastructure/observability/security-events.ts` (`staleCredentialsTotal`) | Prometheus counter asserted (and reset) for the expired-token case. |

## Notes

- **Attack vs. metric distinction:** A forged/tampered credential produces an audit log entry (`security.*` action); an *expired* credential only increments `staleCredentialsTotal`. The tests explicitly assert the *absence* of an audit entry in the expired case.
- **Audit entry shape:** The spy inspects `call[2]` (the third argument to `auditLogger.log`), not the first or second — the action/metadata object is always the third parameter.
- **Counter isolation:** `staleCredentialsTotal.reset()` is called before the expired-token test so the `.get()` assertion isn't polluted by prior tests.
- **Timer cleanup:** `jest.useRealTimers()` in `afterEach` guards against leaked frozen clocks from `freezeDate`/`advanceDate`.
- **Webhook endpoint:** Tests hit `/payments/webhook/fake` (a test-only provider), not a real provider URL.
