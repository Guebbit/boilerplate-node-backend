---
source: tests/support/shopper-routes.ts
sha256: d11472f4b29fb95f485d7308ed137dec7ec5566431c75a19e8225aa3ab036688
generated_at: 2026-11-08T10:00:36.976646+00:00
model: ollama:qwen3.8:27b
---

# tests/support/shopper-routes.ts

## Purpose

Determines which seeded role (`user` or `admin`) a spec-walking test suite should authenticate as for a given API path. All routes default to `admin` so that any refusal is attributable to the controller's logic rather than a permission gate; the exception is shopper-owned routes (cart, 2FA enrollment, payment intent/confirm/sync), which are sent as `user` because they operate on the caller's own basket and order.

## Key elements

- **`SHOPPER_ROUTE`** (module-level regex) — Matches paths for `/cart`, `/account/2fa`, and `/payments/{id}/confirm`, `/payments/{id}/sync`, `/payments/intent`.
- **`roleReaching(operation)`** (exported) — Accepts an object with a `path` property (subset of the `Operation` type from `spec-walk`) and returns `'user'` if the path matches `SHOPPER_ROUTE`, otherwise `'admin'`.

## Relationships

- **`tests/support/spec-walk.ts`** — Supplies the `Operation` type that `roleReaching` consumes as its parameter type.
- **`tests/contract/request-contract.test.ts`**, **`tests/contract/write-methods.test.ts`**, **`tests/integration/malformed-ids.test.ts`** — Test suites that call `roleReaching` to decide the authentication role before dispatching each operation through the spec walker.

## Notes

- The regex uses a `{id}` placeholder rather than a concrete ID; it matches any literal segment in that position.
- The 2FA enrollment route is classified as shopper-owned because an armed administrator would be challenged for a code before reaching the controller, which would conflate permission checks with the behavior under test.
