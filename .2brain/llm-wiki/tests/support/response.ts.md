---
source: tests/support/response.ts
sha256: c58a0c14381ef8f80f601387a459b44a9e83ac9caeaf2ea43172c127c2f7d280
generated_at: 2026-10-29T07:10:26.306330+00:00
model: ollama:qwen3.8:27b
---

# tests/support/response.ts

## Purpose

Provides test helpers that narrow a service's `ResponseSuccess<T> | ResponseReject` union into a single arm via an explicit assertion. This replaces inline `as` casts at assertion sites, so a response that took the wrong branch fails loudly on its own line (with "expected `success` to be `false`") rather than silently reading a property as `undefined`.

## Key elements

- **`asReject<T>(response)`** — Asserts `response.success === false`, then returns the value typed as `ResponseReject`. Fails the test if the response was actually a success.
- **`asSuccess<T>(response)`** — Asserts `response.success === true`, then returns the value typed as `ResponseSuccess<T>`. Fails the test if the response was actually a reject.

Both are generic over the payload type `T` and accept the full union, returning only the confirmed arm.

## Relationships

- **`src/infrastructure/http/response.ts`** — Source of the `ResponseSuccess` and `ResponseReject` types that these helpers narrow. This file is the *consumer* of that module's type definitions.
- **All integration test files** (e.g. `src/modules/account/tests/integration/*.test.ts`, `src/modules/orders/tests/integration/*.test.ts`, etc.) — Import `asReject` / `asSuccess` to assert which branch a service call took before inspecting the payload, replacing repeated `as` casts.

## Notes

- The narrowing is *runtime-assertion-based*, not type-system-based. The `as` cast at the end of each function is only safe because the `expect(...)` line before it would have already thrown. Removing or reordering those lines would reintroduce the silent-`undefined` failure mode the file exists to prevent.
- The helpers are intentionally minimal (two one-liner assertions + a return). If you find yourself wanting to log the full response body in the failure message, that is a deliberate scope decision against — keep the assertion atomic so the failure line points at the wrong-branch fact, not a payload diff.
