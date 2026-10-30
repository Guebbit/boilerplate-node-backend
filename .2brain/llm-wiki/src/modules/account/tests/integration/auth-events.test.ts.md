---
source: src/modules/account/tests/integration/auth-events.test.ts
sha256: 15e46e35969bb94426d2c1527aa0686326ec426fd93b9eeb322b582cb2324e00
generated_at: 2026-10-29T02:53:13.562475+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-events.test.ts

## Purpose

Integration test verifying the audit-trail entries produced when a one-time link token is rejected (unknown or expired) and when a login attempt fails. It asserts the correct `action`, `targetId`, and `metadata.flow` values reach the logger, and that the Prometheus rejection counter increments per flow. Lives under `auth.*` (not `security.*`) because a stale link is the common customer-facing cause.

## Key elements

- **`Entry`** — local interface modelling one call to `auditLogger.log` (`action`, `targetId`, `metadata`).
- **`auditSpy`** — Jest spy installed in `beforeEach` that replaces `auditLogger.log` so entries can be inspected without a real sink.
- **`entries()`** — helper that flattens `auditSpy.mock.calls` into an `Entry[]`.
- **`rejectedFlows()`** — filters entries to `AUTH_ONE_TIME_TOKEN_REJECTED` actions and returns their `metadata.flow` values.
- **`describe('an unknown one-time token')`** — `it.each` over five flows (`password_reset`, `email_verify`, `email_change`, `email_change_undo`, `account_restore`); asserts 422 status, correct flow in audit, and counter increment. Also covers an expired token (via `plantToken` + `advanceDate`) and a negative case where a mismatched password pair is refused before token rejection.
- **`describe('a failed login')`** — asserts the `AUTH_LOGIN` entry carries a `pseudonymise('log', …)` digest as `targetId` (never the raw email), and that a non-string `email` body yields an entry with no `targetId`.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — spied via `jest.spyOn(auditLogger, 'log')`; all assertions read from this spy's call log.
- **`src/infrastructure/security/pseudonymise.ts`** — called directly in the expected-value expression (`pseudonymise('log', 'victim@example.com')`) to confirm the digest format.
- **`src/modules/account/audit.ts`** — provides `accountAuditActions` constants used as the `action` filter.
- **`src/modules/account/metrics.ts`** — provides `authOneTimeTokenRejectedTotal`; the test resets and reads the counter after each request.
- **`src/modules/account/tests/factories.ts`** — `plantToken` seeds a one-time token row with a short TTL for the expiry scenario.
- **`src/modules/users/tests/factories.ts`** — `createUser` provisions a user; `PLAIN_PASSWORD` supplies the reset body.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` advance the clock past a token's TTL.
- **`tests/support/http.ts`** — `api()` returns a supertest-style client for issuing POST requests.
- **`tests/support/setup-test-db.ts`** — called once at module level to seed an isolated database.

## Notes

- `setupTestDb()` runs at module scope (not in `beforeEach`), relying on the helper to reset between tests internally.
- The `it.each` table hard-codes the five routes and their HTTP verbs; adding a new flow requires a new row here.
- The "mismatched password pair" test documents that a 422 from the *password* validator does **not** emit an `AUTH_ONE_TIME_TOKEN_REJECTED` entry—only token-level rejection does.
- The non-string email test (`{ $ne: '' }`) is a guard against a regression where missing validation would crash the pseudonymise call.
