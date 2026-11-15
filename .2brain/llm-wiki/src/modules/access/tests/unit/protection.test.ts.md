---
source: src/modules/access/tests/unit/protection.test.ts
sha256: 6fab259012087689664b659a8be20d5921805407e050eda9eb78678daa9fd844
generated_at: 2026-11-14T18:29:25.033945+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/unit/protection.test.ts

## Purpose

Unit tests for the staff-account protection rules in the access service. It verifies that `holdsStaffRole`, `staffHoldersAmong`, `canChangeAccount`, `roleProtectedRefusal`, and the pure helpers `mayChangeAccount` / `ownOrderFlag` behave correctly when membership data comes from an in-memory table rather than a real database. The file exists so the role-gate logic can be exercised in isolation, without a live repository or route.

## Key elements

- **`Row`** – local interface describing one membership record (`userId`, `tenantId`, `role`, `scope`).
- **`memberships`** – `Map<string, Row[]>` backing the mocked `membershipRepository`. Each `beforeEach` clears it.
- **`jest.mock('../../repository', …)`** – replaces the membership/tenant repositories with synchronous, Map-backed lookups filtered by `scope` and `tenantId`.
- **`jest.mock('@infrastructure/observability/audit', …)`** – swaps `recordAudit` for a push into the `recorded` array (spreads `requireActual` to keep other exports intact).
- **`hold(userId, tenant?, platform?)`** – helper that populates the Map with tenant-scoped and/or platform-scoped rows using `DEPLOYMENT_TENANT_ID`.
- **`describe('holdsStaffRole')`** – table-driven check that each named staff role (and the platform `operator` role) reads as `true`; a user with no rows reads as `false`.
- **`describe('staffHoldersAmong')`** – verifies batch detection returns a `Set` of qualifying user ids across both scopes.
- **`describe('mayChangeAccount')`** – pure-function test: the 2×2 matrix of (account is staff × caller holds `assign:Role`).
- **`describe('canChangeAccount')`** – service-level tests covering caller/target role combinations, self-targeting, the system-actor bypass, and the unauthenticated "stranger" path.
- **`describe('roleProtectedRefusal')`** – asserts the 403 `ROLE_MANAGEMENT_REQUIRED` refusal shape *and* the exact `security.forbidden` audit entry recorded on failure; asserts no audit on success.
- **`describe('ownOrderFlag')`** – checks that `ownOrderFlag` returns `{ ownOrder: true }` only when the caller id matches the target, and `{}` otherwise (including `undefined` and system contexts).

## Relationships

- **`src/modules/access/services/index.ts`** – the test imports `accessService` and calls its public methods (`holdsStaffRole`, `staffHoldersAmong`, `canChangeAccount`, `roleProtectedRefusal`).
- **`src/modules/access/domain/index.ts`** (re-exporting **`protection.ts`**) – imports the pure helpers `mayChangeAccount` and `ownOrderFlag` for direct, service-free assertions.
- **`src/kernel/access/tenant.ts`** – imports `DEPLOYMENT_TENANT_ID` so that tenant-scoped rows in the Map match the value the production code expects.
- **`src/kernel/permissions.ts`** – imports `systemCallerContext` to exercise the system-actor bypass in `canChangeAccount` and the no-op in `ownOrderFlag`.
- **`tests/support/callers.ts`** – imports `callerContextAs` (builds a typed caller context from a role + user id) and `testCallerContext` (the unauthenticated/stranger fixture).

## Notes

- The module doc-comment explicitly states this is the *unit* counterpart to the integration "users" suite; the same rules run against real routes and a real database there.
- `hold()` hard-codes `DEPLOYMENT_TENANT_ID` for tenant rows and `null` for platform rows; if that constant changes, the mocked `findByUserIds` filter (which compares `row.tenantId === tenantId`) will silently return no rows.
- The audit mock spreads `jest.requireActual` to preserve sibling exports; if the audit module gains new exports the test won't break, but it also won't record them.
- `beforeEach` resets both `memberships` and `recorded`; forgetting to clear `recorded` would cause assertions in `roleProtectedRefusal` to pick up entries from a prior test.
