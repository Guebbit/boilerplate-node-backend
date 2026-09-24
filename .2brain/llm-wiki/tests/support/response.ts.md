---
source: tests/support/response.ts
sha256: bb5e96c9edb9b336c7800a4dacddca229afd2a5425f14100fec3d36ff1e65072
generated_at: 2026-09-23T20:13:14.440642+00:00
model: ollama:qwen3.8:27b
---

# tests/support/response.ts

## Purpose

Test helper that narrows a service's `ResponseSuccess<T> | ResponseReject` union at runtime. Each helper asserts the expected arm via `expect` _before_ casting, so a response that took the wrong branch fails on the assertion line itself rather than surfacing later as a confusing `undefined` read.

## Key elements

- **`asReject<T>(response)`** — Asserts `response.success === false`, then returns the value as `ResponseReject`.
- **`asSuccess<T>(response)`** — Asserts `response.success === true`, then returns the value as `ResponseSuccess<T>`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Source of the `ResponseSuccess` and `ResponseReject` types imported here; defines the union this file narrows.
- **Integration test files** (`account`, `cart`, `delivery`, `feedback`, `orders`, `payments`, `order-snapshot-locale`) — All import `asReject`/`asSuccess` to narrow service responses before asserting on `.data` or other arm-specific properties.

## Notes

- Both helpers call `expect` internally, so they are bound to the test runner (Jest/Vitest) and will throw outside a test context.
- The final `as` cast is only safe because the preceding assertion guards it; removing the assertion silently degrades the helper to a plain unsafe cast.
- `asSuccess` does not assert on `data` being present because the type system already requires it on `ResponseSuccess`.
