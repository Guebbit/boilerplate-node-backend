---
source: tests/support/stub.ts
sha256: b1ce61d368e410e5b9925e56a92bc7b098fa7901dedd5dac874872a790080ea2
generated_at: 2026-11-08T10:01:32.813056+00:00
model: ollama:qwen3.8:27b
---

# tests/support/stub.ts

## Purpose
A single, named helper for casting hand-built test stubs to the framework types they stand in for (e.g., `Request`, `Response`, Mongoose `CastError`). It centralises the one unavoidable double-cast (`as unknown as T`) so it lives behind a meaningful name instead of being scattered inline across every test suite.

## Key elements
- **`asStub<T extends object>(value: unknown): T`** — The sole export. Casts an arbitrary `unknown` value to `T`. The type parameter is supplied at the call site (e.g. `asStub<Request>(stub)`) to make the intent explicit.

## Relationships
- Consumed by test files across `src/modules/account/tests/` (unit, integration, factories, strategy-doubles) to cast lightweight objects into full framework types.
- Also used by `src/modules/analytics/tests/unit/relay.test.ts` and `src/modules/audit-logs/tests/integration/repository.test.ts`, making it a cross-module test-support utility.
- Pairs with `src/modules/account/tests/factories.ts` and `src/modules/account/tests/strategy-doubles.ts`, which build the stub objects that are then cast through `asStub`.

## Notes
- The project's `no-restricted-syntax` ESLint rule bans inline `as unknown as T` double-casts everywhere; this file is the single sanctioned exception (it carries an `eslint-disable-next-line` for `no-unnecessary-type-parameters`).
- The type parameter is **intentional**, not a lint smell: it is the call site's declaration of what the stub represents. Do not "simplify" it away.
- The file lives under `tests/support/`, not under any module's `tests/` directory, signalling it is a shared, module-agnostic helper.
