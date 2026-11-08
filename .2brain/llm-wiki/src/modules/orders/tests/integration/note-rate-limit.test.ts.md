---
source: src/modules/orders/tests/integration/note-rate-limit.test.ts
sha256: b658fbaece7b8118b20041cf55384a9fba82807ff660894d5d25d2ec0835c0ed
generated_at: 2026-11-08T07:06:08.342093+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/note-rate-limit.test.ts

## Purpose

Integration test that verifies the per-account staff-note rate limiter (for `POST /orders/{id}/timeline/notes`) enforces its budget correctly over real HTTP. It isolates the limiter's own property (429 after exhaustion, per-account isolation) from the routing/permission concerns covered in `routes.test.ts`.

## Key elements

- **`asAccount`** – A minimal `RequestHandler` that replaces `getAuth`; reads the account id from the `x-account` header and attaches it as `request.authContext` (a stub `AuthContext`).
- **`attempt(app, account)`** – Sends a `POST /notes` request via `supertest` with the given `x-account` header; resolves to the HTTP status code.
- **`notesApp(limit)`** – Builds a throwaway Express app: loads `ordersNoteLimiter` from `@modules/orders/rate-limits` with `NODE_ORDER_NOTE_RATE_LIMIT_MAX` set to `limit` (via `withReloadedRateLimits`), then mounts the limiter on `POST /notes` returning `201 {}`.
- **`describe('the staff-note budget')`** – Single test case: fires 3 sequential note attempts for account `"a"` (expects `[201, 201, 429]` with a budget of 2), then confirms account `"b"` still gets `201`.

## Relationships

- **`src/modules/orders/rate-limits.ts`** – The module under test; `notesApp` dynamically imports it (through the rate-limit harness) to obtain `ordersNoteLimiter` configured with a chosen budget.
- **`src/types/auth-context.ts`** – Source of the `AuthContext` type that `asAccount` stubs onto the request.
- **`src/types/index.ts`** – Barrel re-export used as the `@types` import path for `AuthContext`.
- **`tests/support/rate-limit-harness.ts`** – Provides `withReloadedRateLimits`, which reloads the limiter module with a specific environment variable so each test can set an arbitrary budget.
- **`tests/support/stub.ts`** – Provides `asStub`, used to create the minimal `AuthContext` object from a single `id` field.

## Notes

- `afterEach(() => jest.resetModules())` is essential: the rate-limit harness mutates module-level state, so each test must start from a fresh module graph.
- The test deliberately does **not** exercise the real route or permission middleware; those are asserted in `routes.test.ts`. This file's contract is narrow: the limiter, given a per-account key, enforces the configured maximum.
- The env var name is `NODE_ORDER_NOTE_RATE_LIMIT_MAX` (not `STAFF_…` or `ORDER_NOTE_…` alone) — check that when adjusting budgets.
