---
source: src/modules/delivery/tests/unit/routes.test.ts
sha256: 58fabaa64b31fc00e07b996fcacebcf63699362c19d53adae9e6ab1d9f1f6894
generated_at: 2026-09-23T18:38:43.352786+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/routes.test.ts

## Purpose

Unit tests for the delivery module's route table. Verifies that the four documented endpoints are mounted in the expected order and that each carries the correct authentication/authorization guard. The final "sweep" test acts as a safety net: any future route added without a guard will fail this suite rather than shipping open.

## Key elements

- **`routeSignatures(router)`** — asserts the exact list and order of mounted endpoints (`GET /methods`, `GET /order/:orderId`, `POST /order/:orderId/ship`, `POST /order/:orderId/deliver`).
- **`guardsOn(router, signature)`** — returns the guard names attached to a given route; used in each per-route assertion.
- **Per-route guard tests** — confirm `GET /methods` has no `isAuth`; `GET /order/:orderId` has `isAuth` but no `requirePermissionGuard`; both `POST` write routes carry `requirePermissionGuard`.
- **Sweep test** (`leaves nothing but the methods list unauthenticated`) — filters all routes, keeps only those without `isAuth`, and asserts the result is exactly `['GET /methods']`. This is the drift guard for future route additions.

## Relationships

- **`src/modules/delivery/routes.ts`** — provides the `router` instance under test; all assertions target its mounted routes and guards.
- **`tests/support/routes.ts`** — provides the `routeSignatures` and `guardsOn` helpers that introspect a router's route table and per-route guard array.

## Notes

- Guards are attached **per route**, not inherited from a parent. The file's own doc comment flags this as the most likely drift point when a fifth route is added.
- `isAuth` on `GET /order/:orderId` is only the _presence_ gate; the actual ownership check (caller owns the order) lives downstream in the controller/service layer.
- The sweep test checks for `isAuth` specifically, not for `requirePermissionGuard`. A route that has `requirePermissionGuard` but not `isAuth` would pass the sweep — a minor gap if that combination were ever meaningful.
- Assertions are by **guard name string**, not by invoking the guards. Renaming a guard in the app without updating these strings will break the tests.
