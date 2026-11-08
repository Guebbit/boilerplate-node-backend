---
source: tests/cross-cutting/account-protection-routes.test.ts
sha256: c693df0a32435ae601858d233cc562e2977a5fa8a007bf023b087cda2f1022ea
generated_at: 2026-11-08T09:22:20.918314+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/account-protection-routes.test.ts

## Purpose

Guarantees that every write route mounted on the `users` module is explicitly accounted for in the account-protection matrix. A new write route added to `users` will fail this test until it is either added to `PROTECTION_ROWS` or documented in `UNOWNED_WRITES` with a reason, making the protection rule only as strong as the list it audits.

## Key elements

- **`WRITE_METHODS`** – `Set` of state-changing HTTP verbs (`POST`, `PUT`, `PATCH`, `DELETE`) used to filter the route table.
- **`mountedWrites()`** – Builds the canonical list of write routes (`"users METHOD path"`) from `effectiveRouteTable(ROUTED_MODULES.users)`.
- **Test: "lists every write route of users, as a row or as unowned"** – Asserts no mounted write is missing from the union of `PROTECTION_ROWS` routes and `UNOWNED_WRITES` keys (completeness).
- **Test: "has no stale entry"** – Asserts every route in `PROTECTION_ROWS` ∪ `UNOWNED_WRITES` actually exists in the mounted table (no dead entries).
- **Test: "never lists a route as both a row and unowned"** – Asserts the two lists are disjoint (no ambiguity).

## Relationships

- **`tests/support/account-protection-rows.ts`** – Source of `PROTECTION_ROWS` and `UNOWNED_WRITES`, the two disjoint lists this test cross-checks against the live route table.
- **`tests/support/routed-modules.ts`** – Provides `ROUTED_MODULES.users`, identifying which module's routes to inspect.
- **`tests/support/routes.ts`** – Provides `effectiveRouteTable` for building the route list and four mock factories (`cacheMock`, `routeFlagMock`, `storageMock`, `securityMock`) that this file uses to stub infrastructure middleware.

## Notes

- The bidirectional check pattern (completeness + no-stale + no-overlap) means the test suite catches both omissions and rot: adding a route without a row fails test 1; removing a route without cleaning up the row fails test 2.
- All four middleware mocks are wired through `jest.requireActual('@tests/routes')` rather than defined inline, so the mock logic lives in `routes.ts` and stays in sync with other test files that mock the same middleware.
