---
source: tests/unit/kernel/step-up.test.ts
sha256: 7dd12577b2eeaed7b02d21b4c51381b49ba0e87aa65560bf1e0425840e54553a
generated_at: 2026-10-15T13:23:05.341439+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/step-up.test.ts

## Purpose

Unit tests for the step-up reauthentication path inside `requirePermission`. When a permission key (from `shared/authorization-keys.yaml`) carries a `stepUp` field, the middleware must challenge stale sessions with a 401 carrying both an OAuth `WWW-Authenticate` header and an app-level error envelope, while still returning a flat 403 to callers who lack the key entirely. These tests pin that ordering, the audit trail, and the dynamic tier-window reading.

## Key elements

- **`makeRequest(context)`** — Builds a stub `Request` with `authContext`, a scoped caller (`callerInScope`), and a fixed `DELETE /users/u1` path.
- **`makeResponse()`** — Builds a stub `Response` with chainable `status`, `json`, and `setHeader` jest mocks.
- **`emitAuditEvent` (module-level jest mock)** — Patches `@infrastructure/observability/audit`. The mock block also overrides `recordAudit` because that function closes over its own module's `emitAuditEvent` and would bypass the plain override.
- **`describe('a key that demands step-up')`** — Six cases: fresh session passes; stale session gets 401; tier window read per-request via `NODE_REAUTH_TIME_CRITICAL`; both challenge dialects emitted; audit event recorded with key + tier; unauthorized caller gets 403 (not 401) and a `security.forbidden` audit.
- **`describe('a key that does not demand step-up')`** — Confirms a key without `stepUp` lets an ancient session through without challenge.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — System under test; `requirePermission` is the single function under assertion.
- **`src/kernel/permissions.ts`** — `callerInScope` resolves the caller object placed on the stub request.
- **`src/types/auth-context.ts`** — `AuthContext` type parameterises `makeRequest`.
- **`src/types/index.ts`** — Barrel export that re-exports `AuthContext`.
- **`tests/support/callers.ts`** — `asAdmin` / `asCustomer` fixtures supply realistic `AuthContext` shapes.
- **`tests/support/environment.ts`** — `withEnvironment` temporarily sets `NODE_REAUTH_TIME_CRITICAL` for the tier-window test.
- **`tests/support/stub.ts`** — `asStub` casts partial objects into Express types so the middleware compiles without a real Express instance.

## Notes

- The `jest.mock` block for the audit module is the trickiest part. `recordAudit` in production calls its *own* module-scoped `emitAuditEvent`; a plain `jest.mock` override of `emitAuditEvent` is invisible to that closure. The mock therefore re-implements `recordAudit` to funnel through the wrapped `emitAuditEvent`, which is the function the test file asserts on.
- 401 vs 403 is an intentional information-disclosure boundary: a 401 tells the caller "you *could* do this, just re-auth," which leaks permission-model details to someone who should not know the action exists.
- `authTime` is always read from the token claim, never recomputed; the tests set it directly on the `AuthContext`.
- The tier window (`maxAge`) is resolved at request time from `NODE_REAUTH_TIME_CRITICAL`, not cached at module load — the test with `withEnvironment` exists to guard against that regression.
