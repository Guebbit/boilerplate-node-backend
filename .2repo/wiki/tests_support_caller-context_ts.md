# tests/support/caller-context.ts

## Purpose

Provides a minimal `CallerContext` fixture so that service-level tests (which invoke service functions directly, bypassing the HTTP controller) can supply the required caller argument without constructing a full request object. Keeps those tests focused on service logic rather than plumbing.

## Key elements

- **`testCallerContext`** (`CallerContext`) — A pre-built anonymous context (`{ caller: {} }`). Use when the test doesn't care *who* is calling, only that the emit/caller-lookup code paths don't throw on a missing identity.
- **`testCallerContextFor(id: string, admin = false)`** (`(id, admin?) → CallerContext`) — Factory that returns a context for a specific authenticated caller. Pass an ID and optionally set `admin: true` when the service under test branches on caller identity or role.

## Relationships

- **`src/infrastructure/http/request.ts`** — Source of the `CallerContext` type imported here. This file is a pure consumer of that type; it does not re-export it.
- **All listed test files** (account, cart, delivery, orders, payments, products, users integration/unit tests) — Import `testCallerContext` or `testCallerContextFor` to satisfy the `CallerContext` parameter when calling services directly in test bodies.

## Notes

- The import uses the `@infrastructure/http/request` path alias, not a relative path — consistent with the project's tsconfig aliases.
- The object is a plain literal, not a class instance, so structural typing is all that matters. Tests can spread or override individual fields if they need a partial variant rather than picking one of the two exports.
