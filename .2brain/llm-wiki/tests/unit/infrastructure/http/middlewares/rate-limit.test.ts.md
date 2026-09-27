---
source: tests/unit/infrastructure/http/middlewares/rate-limit.test.ts
sha256: 11ae96bf46d6a4de48d840e18b7884477f89d9c160540ceaea67bcfc4c6d1d51
generated_at: 2026-09-27T16:07:44.272326+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit.test.ts

## Purpose

Unit tests for the infrastructure-level rate-limit configuration: the default numeric budgets (browsing, API-key, upload), the relative sizing invariants between them, the `skip` predicate on the global browsing budget, and the `identityOf` bucketing function. It deliberately excludes the middleware's request-handling behaviour (delegated to integration tests) and module-specific budgets (pinned in each module's own test file).

## Key elements

- **`describe('rate limit defaults')`** — asserts `DEFAULT_RATE_LIMIT_WINDOW_MS` = 60 s, `DEFAULT_RATE_LIMIT_MAX` = 100, and verifies the upload budget < half the browsing budget and the API-key budget sits between upload and browsing.
- **`describe("the global budget's skip")`** — locates the `'Browsing (global)'` entry in `INFRASTRUCTURE_RATE_LIMITS` and verifies its `skip` exempts only `GET /readyz`, not other methods or paths.
- **`describe('identityOf')`** — verifies `identityOf` normalises email (case, trailing space) for identified callers, and falls back to the caller's IP for anonymous requests (empty/undefined body).
- **`requestWith(body, ip)` / `requestFor(method, path)`** — local helpers wrapping `asStub<Request>` to build minimal Express `Request` objects for the tests.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — the module under test. Imports `identityOf`, `DEFAULT_RATE_LIMIT_MAX`, `DEFAULT_RATE_LIMIT_WINDOW_MS`, `DEFAULT_API_KEY_RATE_LIMIT_MAX`, `DEFAULT_UPLOAD_RATE_LIMIT_MAX`, and `INFRASTRUCTURE_RATE_LIMITS`.
- **`tests/support/stub.ts`** — provides the `asStub` generic used to construct typed stub objects without a full `jest.fn()` harness.

## Notes

- The file's header comment maps out the rate-limit test surface: module-specific budgets live in `src/modules/<name>/tests/unit/rate-limits.test.ts`; cross-cutting budget-relationship assertions live in `tests/cross-cutting/rate-limit-budgets.test.ts`; the behavioural "request spends budget" path is an integration test (see `src/modules/feedback/tests/integration/submission-rate-limit.test.ts`) because `no-restricted-imports` classifies `express-rate-limit` as an integration dependency.
- `identityOf` is not a pure IP extractor: it prefers the parsed `body.email` when present, otherwise derives a bucket from the `ip` field. The tests confirm it is *not* a single shared anonymous bucket (different IPs → different buckets).
