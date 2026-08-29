# tests/support/stub.ts

## Purpose

Provides a single sanctioned cast helper for hand-built test stubs. Because framework types (`Request`, `Response`, Mongoose `CastError`, etc.) have hundreds of members that a minimal stub cannot structurally satisfy, some cast is unavoidable. This file centralizes that cast behind one named export so the ESLint `no-restricted-syntax` rule can ban the raw `as unknown as T` spelling everywhere else in the codebase.

## Key elements

- **`asStub<T extends object>(value: unknown): T`** — Casts an `unknown` value to a target type `T`. The type parameter is supplied by the caller (e.g. `asStub<Request>(stub)`), making the intended type explicit at every call site. Exported as a named `const` arrow function.

## Relationships

Imported directly by integration and unit test files across multiple modules (account, audit-logs, feedback, locales, observability, orders, products, users). Each importing test uses `asStub` to cast its hand-built mock objects into the interface they are standing in for (e.g. `Request`, `Response`, a repository, or a service). No source (non-test) file imports it.

## Notes

- A project-wide `no-restricted-syntax` ESLint rule forbids the inline `as unknown as T` double cast; this file is the sole location where that conversion is permitted.
- The `<T extends object>` constraint intentionally prevents casting to primitives, narrowing the helper to object-shaped framework types only.
- The `@typescript-eslint/no-unnecessary-type-parameters` rule is disabled for this one export — the type parameter is the point (it documents the target type at the call site).
