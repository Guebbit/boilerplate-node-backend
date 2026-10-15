---
source: src/modules/orders/tests/integration/hierarchy.test.ts
sha256: e3703f9fb4ef6f1c95eb0efca5b8d4391868ffc0d4eab6a1a23acdf43ad573a4
generated_at: 2026-10-15T11:14:53.740172+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/hierarchy.test.ts

## Purpose

Integration tests that verify the two-level permission model for order mutations: (1) a read-only role must not gain write access, and (2) an operator may only act on orders whose buyer is strictly lower in the role hierarchy. Every case is driven through `orderService` to exercise the real permission checks, not mocks.

## Key elements

- **`STAFF_ID`** – A valid-format ObjectId that references no real account; used as the `callerId` for all non-owner role scenarios.
- **`orderOf(role, status?)`** – Creates a user, a product, and a pending (or given-status) order owned by that user.
- **`statusOf(id)`** – Reads the stored order status from `orderRepository` to confirm a refused write left the record untouched.
- **`refusalCode(result)`** – Asserts the result is a failure and returns the first error code for further matching.
- **`actionsFor(orderId, role, callerId)`** – Fetches the order via `orderService.getById` → `withActions` and projects the six client-facing action booleans/arrays (`cancel`, `pay`, `recordPayment`, `transitions`, `start`, `override`).
- **`describe('cancelById — the write's own scope')`** – Confirms warehouse/support (read-only) are refused 404 on both pending and paid orders, while customer/moderator/manager/admin (write-capable) succeed.
- **`describe('what an order offers each caller')`** – Asserts the action surface each role sees: buyer gets `cancel`+`pay`, warehouse gets none, operator gets `cancel` only on a lower-rank buyer's order, admin gets `recordPayment` but never on their own order, etc.
- **`describe('the rank rule on an order')`** – Table-driven (`it.each`) matrix of caller × buyer roles expecting `allowed` or `OUTRANKED`; also verifies the rule applies to `updateById`, `removeById`, `restoreById`, `overrideStatus`; confirms `SYSTEM_ACTOR` bypasses the rule; and confirms a detached buyer (via `orderRepository.detachUserId`) leaves the order open to any operator.

## Relationships

- **`@modules/orders/services` (`orderService`)** – The system under test; all assertions target its public methods (`cancelById`, `getById`, `withActions`, `updateById`, `removeById`, `restoreById`, `overrideStatus`).
- **`../../repository` (`orderRepository`)** – Used directly to verify persisted state after refused writes and to simulate a detached buyer (`detachUserId`).
- **`@tests/setup-test-db`** – In-memory / test database setup called once at module load.
- **`@tests/callers` (`callerContextAs`, `asRole`)** – Helpers that build the permission context and actor descriptor passed into service calls.
- **`@modules/users/tests/factories` (`createUser`)** – Provisions test users with a given role.
- **`@modules/products/tests/factories` (`createProduct`)** – Provisions a product for order items.
- **`@modules/orders/tests/factories` (`createOrder`, `toOrderItem`)** – Provisions the order documents under test.
- **`@types` (`OrderStatus`)** – Enum used for status parameters and assertions.
- **`@infrastructure/http/response` (`ResponseReject`)** – Type used to extract `.errors[0].code` from a rejected result.
- **`@kernel/permissions` (`SYSTEM_ACTOR`)** – The system-level actor that must bypass the rank rule.

## Notes

- `STAFF_ID` is intentionally a *real* ObjectId shape but points to no user; this ensures the test exercises the rank/role path, not an ownership short-circuit.
- The file tests through the **service layer**, not HTTP routes, so middleware-level auth is out of scope here.
- The rank rule is *strict*: a caller at the same rank as the buyer (e.g. admin cancelling admin's order) is refused with code `OUTRANKED`. The only exception is the caller acting on their *own* order, where ownership bypasses the rank check.
- `SYSTEM_ACTOR` is passed without the four-argument caller context (just `id`), matching its special handling in the service.
- The last visible test (`detachUserId`) verifies that once a buyer account is removed from an order, the rank rule no longer applies because there is no buyer rank to compare against.
