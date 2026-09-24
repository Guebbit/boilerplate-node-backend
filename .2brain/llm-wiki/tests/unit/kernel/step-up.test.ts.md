---
source: tests/unit/kernel/step-up.test.ts
sha256: 2d65e238bed8d50358a30d3d777e4a179ed56965acd64d87d1dad18419959252
generated_at: 2026-09-23T20:28:17.280262+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/step-up.test.ts

## Purpose

Unit tests for the step-up (re-authentication) path inside `requirePermission`. When a permission key in `shared/authorization-keys.yaml` carries a `stepUp` flag, a stale session must be challenged (401) while a caller who never held the permission at all must be flatly refused (403). The file also asserts that every challenge is recorded via the audit pipeline so the demand is reconstructable after the fact.

## Key elements

- **`emitAuditEvent`** (module-level `jest.fn`) – the single spy all audit assertions target; cleared in `beforeEach`.
- **`jest.mock('@infrastructure/observability/audit', …)`** – replaces `emitAuditEvent` with the spy and also overrides `recordAudit` (see Notes).
- **`makeRequest(context: AuthContext)`** – builds a minimal Express `Request` stub carrying `authContext`, `caller` (via `callerInScope`), `path`, `method`, and empty headers.
- **`makeResponse()`** – builds a chainable `Response` stub whose `status`/`json` return the same object.
- **`describe('a key that demands step-up')`** – five cases against the `users.any.delete` key (critical tier, stepUp enabled):
    - fresh caller passes
    - stale caller gets 401, not 403
    - response carries both `WWW-Authenticate` header and `errors[].code: REAUTH_REQUIRED` envelope
    - audit event `security.reauth_required` is emitted with the key and tier
    - no-permission caller gets 403 + `security.forbidden` audit, _not_ a challenge
- **`describe('a key that does not demand step-up')`** – single case: `users.any.update` with `authTime: 0` still passes, confirming step-up is opt-in per key.

## Relationships

| Neighbor                                   | Interaction                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `src/kernel/middlewares/authorizations.ts` | Imports `requirePermission` — the system under test.                                                 |
| `src/kernel/permissions.ts`                | Imports `callerInScope` to derive the scoped caller attached to each request stub.                   |
| `src/types/auth-context.ts`                | Type imported (via `@types` barrel) to annotate `makeRequest`'s parameter.                           |
| `src/types/index.ts`                       | Barrel re-exporting `AuthContext`; the actual import specifier in the file.                          |
| `tests/support/callers.ts`                 | Imports `asAdmin`, `asCustomer` to construct realistic `AuthContext` fixtures.                       |
| `tests/support/stub.ts`                    | Imports `asStub` to cast plain objects into typed Express `Request`/`Response`/`NextFunction` stubs. |

## Notes

- **The `recordAudit` override is load-bearing.** `requirePermission`'s step-up branch calls `recordAudit`, which in the real module closes over its own `emitAuditEvent` binding — invisible to a simple property swap. The mock therefore re-implements `recordAudit` to route through the spy explicitly. Without this, the "records that the challenge was demanded" test would silently pass with zero spy calls.
- **401 vs 403 is the security invariant, not an implementation detail.** The file's doc-block calls this out: a 401 tells the client "you _might_ have this permission, prove yourself," which is a fact about the model they have not earned. The tests pin the status code _and_ the audit action to make that distinction explicit.
- **`authTime` is read verbatim from the token claim** (never derived server-side), so the tests set it directly: `NOW()` for fresh, `NOW() - 86_400` for stale, `0` for "ancient."
- **Two response dialects are asserted together** (OAuth `WWW-Authenticate` header _and_ the app-specific `errors[].code` envelope) because different client stacks read different fields.
