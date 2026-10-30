---
source: tests/support/shopper-routes.ts
sha256: 24180f3cbeb43515acc3408634acbcc5678e2ea5a0b4b1e93075154f75b2a627
generated_at: 2026-10-29T07:11:31.465186+00:00
model: ollama:qwen3.8:27b
---

# tests/support/shopper-routes.ts

## Purpose

Maps each API operation to the HTTP role (`user` or `admin`) under which spec-walking test suites should call it. The default is `admin` so that any refusal is attributable to the controller logic rather than a permission gate; a small set of shopper-specific routes (cart, wishlist→cart, payment steps, 2FA enrolment) are the exception and are sent as `user`.

## Key elements

- **`SHOPPER_ROUTE`** (module-private regex) — matches paths for cart operations, `account/2fa`, `wishlist/{productId}/move-to-cart`, and the three payment sub-routes (`intent`, `confirm`, `sync`).
- **`roleReaching(operation)`** (exported) — the sole public API. Accepts an `Operation` (or any object with a `path` string) and returns `'user'` if the path matches `SHOPPER_ROUTE`, otherwise `'admin'`.

## Relationships

- **`tests/support/spec-walk.ts`** — provides the `Operation` type that `roleReaching`'s parameter is typed against.
- **`tests/contract/request-contract.test.ts`**, **`tests/contract/write-methods.test.ts`**, **`tests/integration/malformed-ids.test.ts`** — consumers that call `roleReaching` to decide which bearer-token identity to attach to each generated request.

## Notes

- The 2FA route is intentionally classified as shopper: an *armed* admin would be challenged for a verification code before reaching the controller, which would confound spec-walk assertions.
- `roleReaching` accepts `Pick<Operation, 'path'>`, so callers can pass a bare `{ path }` object without constructing a full `Operation`.
