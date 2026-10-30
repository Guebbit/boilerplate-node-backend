---
source: src/modules/notifications/tests/integration/digest.test.ts
sha256: 814d9bd1da37f11c4ffad1fd782437e044b7d3b35b1e806174e8a63f41b49aa7
generated_at: 2026-10-29T04:32:34.906024+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/digest.test.ts

## Purpose

Integration test for the staff digest job. Drives `runStaffDigest` exactly as the scheduler would — real modules registered, real orders/returns/shipments in the database, the mailer mocked at the boundary — and verifies who receives which summary row, that a re-run is idempotent (no duplicate mail, single row rewrite), that a zero count clears the row, and that bell-only summaries are never mailed.

## Key elements

- **`staff(role, email, locale?)`** — helper that creates a user with the given role, an authenticator app enabled, and a locale.
- **`summariesOf(role, userId)`** — reads the user's notification bell via `notificationsService.listVisible` and returns sorted `[code, count]` pairs.
- **`digestMails()`** — filters the mocked `enqueueEmail` calls to the `notifications.staff-digest` template.
- **`paidAndWaiting(days)`** — creates a buyer, product, and a paid order backdated by `days` so it counts as overdue-unshipped.
- **`describe('the daily digest')`** — seven cases covering: unshipped overdue → bell only; mail idempotency + locale/locale-aware links; growing count rewrites one row; zero count clears the row; bell-only (transfers-due) never mailed; undelivered shipment; awaiting-tracking; returns-undecided and withdrawals-awaiting-goods split by role.
- **`describe('the weekly digest')`** — one case asserting the weekly run clears the daily `unshipped` row, writes no weekly row, and returns `{ written: 0, cleared: 1, mailed: 0 }`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/notifications/services/digest.ts` | `runStaffDigest` is the SUT invoked in every test. |
| `src/modules/notifications/services/index.ts` | `notificationsService.listVisible` reads bell rows for assertions. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` is module-level mocked; tests assert on the call queue. |
| `src/kernel/registry.ts` | `registerModules(enabledModules)` re-registers the module graph in `beforeEach`. |
| `src/kernel/permissions.ts` | `callerInScope` builds the permission-aware caller passed to `listVisible`. |
| `src/kernel/access/tenant.ts` | `DEPLOYMENT_TENANT_ID` scopes the caller to the deployment tenant. |
| `src/kernel/events.ts` | `resetDomainEvents` in `beforeEach`/`afterEach` isolates event state. |
| `src/domain-primitives/time.ts` | `DAY_MS` used in `paidAndWaiting` date arithmetic. |
| `src/modules.ts` | `enabledModules` array fed to the registry. |
| `src/types/index.ts` | `OrderStatus` enum for order state assertions. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `markOrderPaidAt`, `toOrderItem`, `forceOrderStatus`. |
| `src/modules/delivery/tests/factories.ts` | `carryOrderTo`, `backdateShipments`, `shipEverything`. |
| `src/modules/returns/tests/factories.ts` | `insertBareReturns` for undecided/withdrawal scenarios. |
| `src/modules/users/tests/factories.ts` | `createUser` for both staff and buyer accounts. |
| `src/modules/products/tests/factories.ts` | `createProduct` for order line items. |

## Notes

- The mailer is mocked at the **module** level (`jest.mock`), so no real email is sent; all assertions go through `mockEnqueueEmail.mock.calls`. The test comment "The queue, not the copy" makes this intent explicit.
- `beforeEach` calls both `registerModules` and `resetDomainEvents`; `afterEach` resets events a second time. Omitting either can leak module state or pending domain events between tests.
- The `staff()` helper always sets `authenticatorEnabledAt`, meaning every staff user is treated as 2FA-armed — this is a precondition of the permissions layer, not something the test varies.
- The weekly-digest test asserts the **return object** of `runStaffDigest` directly (`{ written, cleared, mailed }`), not just the bell state — a contract the service is expected to expose.
- `summariesOf` extracts `count` from `item.params` with a fallback of `0`; this assumes the service always places the count under `params.count` rather than a top-level field.
