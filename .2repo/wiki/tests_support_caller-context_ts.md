# tests/support/caller-context.ts

## Purpose

Provides a minimal `CallerContext` fixture for tests that invoke service functions directly, bypassing the HTTP controller layer that would normally construct one from an incoming request. Most service-level tests don't need a meaningful caller identity—only that the field is present so the code path doesn't throw on a missing value.

## Key elements

- **`testCallerContext`** (exported const, type `CallerContext`) — A static object `{ caller: {} }` representing an anonymous caller. Intended to be passed as the caller-context argument when calling service methods in unit/integration tests.

## Relationships

- **`src/infrastructure/http/request.ts`** — Source of the `CallerContext` type that this file imports. This is the only production-code dependency.
- **Test files across modules** (account, cart, delivery, orders, payments, products, users) — All listed integration and unit test files import `testCallerContext` as the default caller-identity argument when calling service functions directly.

## Notes

- The `caller` property is an empty object, not `null` or `undefined`. If a service method accesses nested properties on `caller` (e.g. `caller.email`), those will be `undefined`—that is expected and by design for the "anonymous" default.
- This is a test-only module (lives under `tests/support/`); it should not be imported from production code.
