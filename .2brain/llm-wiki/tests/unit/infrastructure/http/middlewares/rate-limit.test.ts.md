---
source: tests/unit/infrastructure/http/middlewares/rate-limit.test.ts
sha256: e7db3b3b3f602be52dc80e2504928118cab161aa92139ca0e2c514056c268709
generated_at: 2026-10-15T13:14:19.020281+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit.test.ts

## Purpose

Unit tests for the infrastructure-level (global) rate-limiting middleware. It pins the default budget values and their relative ordering, the IP-block keying logic (`addressBlockOf`), the identity-fallback keying logic (`identityOf`), the health-check `skip` predicate, and the refusal handler's side effects (429 envelope, metrics increment, audit record, warn log). It explicitly does **not** test module-specific budgets, cross-cutting budget relationships, or a full request through `express-rate-limit`—those live in other test files (see header docblock).

## Key elements

- **Budget-constant assertions** — verifies `DEFAULT_RATE_LIMIT_MAX` = 100, window = 60 s (via `rateLimitConfig`), and the ordering upload < api-key < browsing×2.
- **`addressBlockOf` tests** — IPv4-mapped (`::ffff:x`) and plain IPv4 → /24; IPv6 → /48; missing IP → `'unknown'`; confirms the block is coarser than `express-rate-limit`'s default /56 key.
- **`identityOf` tests** — email/username are normalised (lowercased, trimmed) before hashing; non-string or blank email falls back to `'anon:<addressBlock>'`; the hash is **not** a bare SHA-256 (prevents dictionary attacks on a Redis dump).
- **Global-budget `skip` tests** — `GET /readyz` and `GET /livez` are exempt; any other method or path is not.
- **`refuseRateLimited` tests** — increments `rateLimitRefusalsTotal` per namespace in isolation; records one `SECURITY_RATE_LIMIT_HIT` audit when `audited: true`; omits audit when `false` but still sends 429; always emits the standard error envelope (`success: false`, code `RATE_LIMITED`); always calls `logger.warn`.
- **Helpers** — `requestWith`, `requestFor`, `blockOf`, `uploaderKey`, `refusalsOf`, `capturingResponse`, `routeRequest` build minimal Express `Request`/`Response` stubs via `asStub`.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — the module under test; all exported functions and constants are imported here.
- **`src/infrastructure/http/config.ts`** — provides `rateLimitConfig` whose `NODE_RATE_LIMIT_WINDOW_MS` and max values are asserted.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is partially mocked (only the write is replaced; `coreAuditActions` stays real so a renamed action fails the assertion).
- **`src/infrastructure/observability/metrics-rate-limit.ts`** — `rateLimitRefusalsTotal` is read to verify per-namespace refusal counting.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is spied on to confirm the refusal is logged even for unaudited budgets.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t` is imported for the i18n message in the 429 envelope.
- **`tests/support/environment.ts`** — `withoutEnvironment` unsets `NODE_RATE_LIMIT_WINDOW_MS` so the default-window assertion isn't skewed by the global test setup.
- **`tests/support/stub.ts`** — `asStub` creates typed `Request`/`Response` stubs without pulling in a full Express app.

## Notes

- The header docblock draws a hard scope boundary: module-specific budgets belong in each module's `tests/unit/rate-limits.test.ts`; cross-cutting "fraction of browsing budget" invariants belong in `tests/cross-cutting/rate-limit-budgets.test.ts`; `isMetricsScraper` lives in the observability module's own test. Don't add those cases here.
- A *successful* request spending the budget (i.e. driving `express-rate-limit` end-to-end) is deliberately **absent**: importing the middleware is treated as an integration concern by `no-restricted-imports`.
- The audit mock uses the `...jest.requireActual` spread pattern so that only `recordAudit` is stubbed; the real `coreAuditActions` enum is what makes the `action` assertion meaningful.
- `tests/support/setup-environment.ts` raises `NODE_RATE_LIMIT_WINDOW_MS` tenfold for the broader suite; the window test must call `withoutEnvironment` first or it will silently pass against the inflated value.
