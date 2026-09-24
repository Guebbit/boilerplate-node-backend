---
source: tests/support/stub.ts
sha256: b1ce61d368e410e5b9925e56a92bc7b098fa7901dedd5dac874872a790080ea2
generated_at: 2026-09-23T20:14:48.066476+00:00
model: ollama:qwen3.8:27b
---

# tests/support/stub.ts

## Purpose

Provides the single sanctioned type-cast helper (`asStub`) for hand-built test stubs that cannot structurally satisfy their framework type (e.g., Express `Request`/`Response`, Mongoose `CastError`). It exists so that the one unavoidable `as unknown as T` conversion lives in a single named, searchable location instead of being scattered as inline double-casts across every test suite.

## Key elements

- **`asStub<T extends object>(value: unknown): T`** — The sole export. Casts an `unknown` value to the caller-specified generic `T`. The type parameter acts as the call-site declaration: `asStub<Request>(stub)` reads as an assertion of intent. Constrained to `extends object`, so primitives are excluded.

## Relationships

- **Consumed by test suites** across the account, audit-logs, feedback, locales, observability, and orders modules (unit and integration). These tests import `asStub` to satisfy types for hand-rolled mocks/stubs of framework objects (Express `Request`/`Response`, Mongoose errors, etc.).
- **`CLAUDE.md`** — Documents the project-wide convention that `no-restricted-syntax` bans inline `as unknown as T` casts in all other files, making this file the only permitted site for that conversion.

## Notes

- An `eslint-disable` comment suppresses `@typescript-eslint/no-unnecessary-type-parameters`; the type parameter is intentionally retained because it serves as the readable assertion at the call site.
- The ESLint `no-restricted-syntax` rule enforces that no other file may perform a raw double cast. If a stub is wrong, it is wrong in this one place — a deliberate single-point-of-failure by design.
