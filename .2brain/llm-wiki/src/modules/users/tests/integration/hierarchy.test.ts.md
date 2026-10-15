---
source: src/modules/users/tests/integration/hierarchy.test.ts
sha256: 3834fb76470b154b4f49187a9336a2c18c12afdd1b4ccc85be42fbd6daa508de
generated_at: 2026-10-15T12:13:31.336139+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/hierarchy.test.ts

## Purpose

Integration tests for the two access-control refusals enforced inside `userService` writes: the **ban key** (`users.any.ban` required to flip `active`) and the **rank rule** (caller must rank strictly below the target, self-editing exempt). Also covers the self-role-change ban. Tests exercise the service layer directly rather than HTTP routes so each case names both the caller's role and the target's role explicitly.

## Key elements

- **`accountHolding(role, name?)`** — creates a real account in the test DB holding the given tenant role.
- **`stored(id)` / `activeOf(id)` / `usernameOf(id)` / `heldRole(id)`** — read-back helpers that assert the persisted state is (or isn't) changed after a refusal.
- **`refusalCode(result)`** — asserts the result is a failure and returns its first error code (`FORBIDDEN`, `OUTRANKED`, etc.).
- **`describe('users.any.ban …')`** — verifies support cannot ban but can edit; moderator/admin can ban and lift; resending an unchanged `active` value is not a ban; a mixed body with a missing key writes nothing.
- **`describe('the rank rule on a user')`** — parameterised matrix of caller/owner role pairs; self-edit exemption; platform-operator outranks all shop roles; dual-role account counted at the higher role; rule applies to soft-delete, hard-delete, and restore; audit event emitted on an outranked attempt.
- **`describe('nobody changes their own role')`** — all shop roles refused when changing their own `role`; resending the already-held role is allowed.
- **Audit mock** — `jest.mock` replaces `emitAuditEvent` and re-wires `recordAudit` (which closes over its own module's `emitAuditEvent`) so calls can be observed via `observePort`.

## Relationships

- **`src/modules/users/services/index.ts`** — primary system under test; calls `updateById`, `removeById`, `restoreById`.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (account creation) and `userRepository` (read-back verification).
- **`src/modules/users/repository.ts`** — the persistence layer behind `userRepository.findById`.
- **`src/modules/access/index.ts`** — `assignRole` to grant platform-operator or dual roles; `rolesOf` to read back the tenant role.
- **`src/modules/access/service.ts`** — underlying permission logic that the tests exercise indirectly.
- **`src/infrastructure/observability/audit.ts`** — mocked; `emitAuditEvent` is spied to assert the `security.forbidden` audit record on outranked attempts.
- **`src/infrastructure/http/response.ts`** — `ResponseReject` type used to cast a failed result and extract `errors[0].code`.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` constant passed to `rolesOf`.
- **`tests/support/callers.ts`** — `callerContextAs(role, id?)` builds the authenticated-caller context for each call.
- **`tests/support/ports.ts`** — `observePort` wraps the mocked `emitAuditEvent` for assertion.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory DB before all tests.

## Notes

- The audit mock exists because `recordAudit` closes over its own module-level `emitAuditEvent`; a plain `jest.spyOn` would not intercept the internal call. The mock re-routes through `buildAuditEvent`.
- Tests intentionally target the **service** layer, not the route. The route-level role matrix lives in a separate cross-cutting suite.
- PUT semantics are exercised: resending an unchanged `active` or `role` value in the body must **not** trigger the ban-key or self-role refusal.
- A platform-operator account (tenant `platform`) is outranked by every shop role, and a person holding both a shop role and `platform/operator` is counted at the **higher** (platform) level.
