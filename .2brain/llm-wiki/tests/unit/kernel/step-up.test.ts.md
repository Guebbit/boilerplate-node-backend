---
source: tests/unit/kernel/step-up.test.ts
sha256: 6a4638f906550e563159cb9912d0025bb32d9f358b0cac7a92510d13cf70468c
generated_at: 2026-11-08T10:28:16.205867+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/step-up.test.ts

## Purpose

Unit tests for the step-up (re-authentication) path of `requirePermission` and `requireFreshAuth`. They verify two non-obvious invariants: (1) a caller who lacks the permission key is refused (403) *before* being challenged to re-authenticate (401), and (2) every step-up challenge is audited so the control can be proven to have fired.

## Key elements

- **`jest.mock('@infrastructure/observability/audit')`** – Replaces `emitAuditEvent` with a `jest.fn()` and *also* rewires `recordAudit` (which in production closes over the real `emitAuditEvent`) so assertions in this file can observe all audit emissions.
- **`makeRequest(context)`** – Builds a stub Express `Request` carrying the given `AuthContext`, a scoped caller, and a fixed `DELETE /users/u1` path.
- **`makeResponse`** – Alias for `makeResponseStub` from `@tests/express`.
- **`auditedReason()`** – Helper that pulls `metadata.reason` off the first recorded audit event.
- **`describe("a key that demands step-up")`** – Six tests covering: fresh session passes, stale session gets 401, tier window read per-request via `NODE_REAUTH_TIME_CRITICAL`, dual challenge dialects (`WWW-Authenticate` header + `REAUTH_REQUIRED` error code), audit emission with `security.reauth_required` / `permission: 'delete:User'`, and 403-forbidden (not 401) when the caller lacks the key entirely.
- **`describe("a key that does not demand step-up")`** – Confirms an ancient session passes through `update:User` without a challenge.
- **`describe("requireFreshAuth with no session on the request")`** – Two tests: an API-key caller gets 403 with audit reason `credential_cannot_step_up`; a request with no caller at all gets 401.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** – Source under test; provides `requirePermission` and `requireFreshAuth`.
- **`src/kernel/permissions.ts`** – Supplies `callerInScope`, used to build the scoped caller on the request stub.
- **`src/types/auth-context.ts` / `src/types/index.ts`** – Provide the `AuthContext` type imported for request construction.
- **`tests/support/callers.ts`** – Provides `asAdmin` / `asCustomer` factory helpers for building auth contexts.
- **`tests/support/environment.ts`** – Provides `withEnvironmentOverrides` to temporarily set `NODE_REAUTH_TIME_CRITICAL`.
- **`tests/support/express.ts`** – Provides `makeResponseStub` used as the response object.
- **`tests/support/stub.ts`** – Provides `asStub` to cast plain objects into typed middleware parameters.

## Notes

- **Audit mock subtlety:** `recordAudit` in the real module closes over its *own* `emitAuditEvent` binding, so a plain `jest.mock` swap of `emitAuditEvent` is invisible to it. The mock explicitly re-implements `recordAudit` to call the *test's* `emitAuditEvent`. Omitting this wiring silently drops the challenge-path assertions.
- **401 vs 403 is a security decision, not a convenience:** 401 tells the client "re-authenticate"; 403 tells the client "this action does not exist for you." The tests assert the *order* matters (refuse before challenge) so that a never-authorized caller never learns that step-up exists.
- **`authTime` is never recomputed** – it is carried from the token's claim. Tests set it explicitly (`NOW() - 86_400`, `0`, etc.) to simulate elapsed time.
- **Two response dialects are asserted simultaneously** because the API serves both OAuth-aware external clients (reading `WWW-Authenticate`) and the app's own SPA clients (reading `errors[].code`).
- **`requireFreshAuth` with a `credentialId` but no session** is a distinct path from a normal stale session: it cannot step up because an API key has no interactive re-auth flow, hence the 403 rather than 401.
