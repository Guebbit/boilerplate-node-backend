---
source: src/modules/orders/tests/integration/create-audit.test.ts
sha256: 0aa528fe1fcb4d241e0fb014e5503eb399458ca9381dc4f3d68707b506de0d52
generated_at: 2026-09-23T19:10:18.828756+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/create-audit.test.ts

## Purpose

Integration test verifying that the order-creation audit trail always reflects the **real** caller's role name (`actor_role_name`), never a hardcoded label like "customer." It guards against a regression where the `create` path could silently overwrite the role with a fixed string.

## Key elements

- **`contextAs(role, id?)`** – local helper that builds a `CallerContext` (caller, `actorRoleName`, `analyticsConsent`) representing a resolved HTTP request with a specific tenant role.
- **`describe("create — the audit row records the real caller…")`** – two cases:
  - Moderator places an order → audit row must carry `actor_role_name: 'moderator'`.
  - Admin places an order → audit row must carry `actor_role_name: 'admin'` (explicitly *not* "customer").
- **`jest.mock('@infrastructure/observability/audit', …)`** – full module replacement (not a spy) of the audit port. Overrides `emitAuditEvent` with a `jest.fn()` and re-wraps `recordAudit` so it routes through the replacement, because `recordAudit` closes over its own module-scoped `emitAuditEvent` reference.
- **`jest.mock('@infrastructure/observability/analytics', …)`** – stubs `emitAnalyticsEvent` to a no-op to prevent side-effects.
- **`setupTestDb()`** – initialises the in-memory test database at module scope.
- **`afterEach(() => jest.restoreAllMocks())`** – resets all mocks between tests.

## Relationships

- **`@modules/orders/services`** (`services/index.ts` → `crud.ts`): imports `create`, the function under test.
- **`@modules/orders/audit`**: imports `ordersAuditActions` enum; asserts the `ORDER_CREATED` action in expectations.
- **`@infrastructure/observability/audit`**: the port being replaced; provides `emitAuditEvent`, `recordAudit`, `buildAuditEvent` used in the mock factory.
- **`@modules/users/tests/factories`**: `createUser` factory for the buyer record.
- **`@modules/products/tests/factories`**: `createProduct` factory for the purchased item.
- **`@tests/ports`**: `observePort` helper that attaches a `jest.spyOn` to the (mocked) port function for assertion.
- **`@tests/callers`**: `callerAs` builds the `caller` object inside `CallerContext`.
- **`@types`** (`types/index.ts` → `auth-context.ts`): `CallerContext` type used by `contextAs`.
- **`@tests/setup-test-db`**: `setupTestDb` initialises the in-memory DB before tests run.

## Notes

- **Why replace instead of spy?** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import (`import * as auditPort`) exposes. The comment in the file cross-references `cancel.test.ts` for the full rationale.
- **`recordAudit` override is non-obvious:** Even after replacing `emitAuditEvent` in the module namespace, the real `recordAudit` still calls its own closure-captured reference. The mock re-wraps `recordAudit` to call `buildAuditEvent` + the replacement `emitAuditEvent`, ensuring the spy sees every audit call.
- **No negative "customer" assertion:** The suite deliberately does *not* test that a plain customer is labelled "customer." It only asserts that elevated roles are never downgraded, keeping the test focused on the regression it guards.
- **`analyticsConsent` is always `false`** in the test contexts to suppress analytics side-effects.
