# tests/unit/kernel/authorization.test.ts

## Purpose

Unit tests for the two read-scoping combinators exported by `src/kernel/authorization.ts`. They assert the kernel's contract in isolation (using stub builders) so that a regression is attributable to the scoping rule itself rather than to any particular repository's filter logic.

## Key elements

- **`createOwnerScope` describe block** — Verifies that for an admin the result is `undefined` and the builder is never invoked; for non-admins the builder is called with the caller's `id`; when `id` is missing the builder still receives `''` (fail-closed); a builder that throws on empty id causes the call to throw (never silently widens). Also confirms the factory returns independent scope functions per call site.
- **`createVisibilityScope` describe block** — Verifies that admin → `undefined`, and that both a guest (`undefined` caller) and a signed-in non-admin produce the builder's return value. Asserts the builder is invoked with **no arguments**, because visibility is a property of the row, not the caller.
- **`OWNED` / `PUBLISHED`** — Local constant filter objects used as stub-builder return values to keep assertions value-based.

## Relationships

- **`src/kernel/authorization.ts`** — The sole import. This file exercises `createOwnerScope` and `createVisibilityScope` as black-box functions, passing jest mocks in as builder arguments and asserting on the returned filter value and call counts.
- The file's doc-comment references `orders/tests/unit/service-scope.test.ts` as the integration-level counterpart that composes these scopes over a real repository; no import link exists, only a documentary pointer.

## Notes

- The distinction between returning `undefined` (admin, "no restriction") and returning `{}` is load-bearing: a caller may branch on `undefined` specifically, and spreading `{}` into a query filter would still match all rows.
- The empty-id test (`callerScope(undefined)`) is the fail-closed guarantee: the combinator must delegate to the builder with `''` rather than short-circuiting, so that a builder rejecting empty ids surfaces as a 500 rather than a data leak.
- Builders are always `jest.fn()` stubs; no real repository or DB is touched here.
- The `admin` flag is optional in the caller object; its absence is treated as `false` (not an admin), never as "unknown → allow."
