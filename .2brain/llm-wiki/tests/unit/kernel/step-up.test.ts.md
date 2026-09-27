---
source: tests/unit/kernel/step-up.test.ts
sha256: 2fd34568a7604e8e6b9c5dc43002067ed596aee176309cf159f348ce751c83bb
generated_at: 2026-09-27T16:12:25.786085+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/step-up.test.ts

## Purpose

Unit tests for the step-up (re-authentication) path of the `requirePermission` middleware. Verifies that a key flagged `stepUp` in `shared/authorization-keys.yaml` triggers a 401 challenge with dual-dialect response and an audit record, while a caller who lacks the key entirely is refused with 403 before any challenge is issued.

## Key elements

- **`requirePermission`** (imported from `@kernel/middlewares/authorizations`) — the middleware under test; called directly with a stubbed request/response/next.
- **`makeRequest(context)`** — builds a stubbed Express `Request` carrying the given `AuthContext`, a `callerInScope` caller, and a fixed `DELETE /users/u1` route.
- **`makeResponse()`** — builds a stubbed Express `Response` with chained `status`/`json`/`setHeader` jest mocks.
- **`emitAuditEvent`** (module-level `jest.fn()`) — the single sink every audit assertion checks against.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces both `emitAuditEvent` *and* `recordAudit` so the test can observe events emitted through either entry point.
- **`describe('a key that demands step-up')`** — five cases: fresh session passes; stale session → 401; response carries both `WWW-Authenticate` header and `errors[].code: REAUTH_REQUIRED`; audit event records `security.reauth_required` with permission + tier; unauthorised caller → 403 + `security.forbidden` (no challenge).
- **`describe('a key that does not demand step-up')`** — confirms a key without the flag lets an arbitrarily old session through.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `requirePermission`, the SUT.
- **`src/kernel/permissions.ts`** — provides `callerInScope`, used to populate the stub request's `caller` field.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — supply the `AuthContext` type used by `makeRequest` and the caller helpers.
- **`tests/support/callers.ts`** — provides `asAdmin` / `asCustomer` factory helpers that produce realistic `AuthContext` objects.
- **`tests/support/stub.ts`** — provides `asStub`, a type-level helper to assert that the partial mock object satisfies the full Express interface.

## Notes

- The `jest.mock` must override **both** `emitAuditEvent` and `recordAudit`. The step-up code path inside `requirePermission` calls `recordAudit`, which internally closes over its *own* module's real `emitAuditEvent`; without the `recordAudit` shim, audit assertions would silently miss events.
- `authTime` is in **epoch seconds** (not ms). The "yesterday" fixture uses `NOW() - 86_400`.
- The test asserts the *ordering* guarantee: permission check precedes step-up check. A caller without the key gets 403 + `security.forbidden`; a caller with the key but an old session gets 401 + `security.reauth_required`. Swapping these would leak the permission model to unauthorised callers.
- No HTTP integration is involved — the middleware is invoked directly, so Express routing, body parsing, and header casing are all out of scope.
