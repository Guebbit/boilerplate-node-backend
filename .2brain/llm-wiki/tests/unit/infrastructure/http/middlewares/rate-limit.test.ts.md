---
source: tests/unit/infrastructure/http/middlewares/rate-limit.test.ts
sha256: 34e2f7edc360577e38888f301afc33faefb7f10dee882da7628c5e96167f1052
generated_at: 2026-11-08T10:16:31.347542+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit.test.ts

## Purpose

Unit tests for the infrastructure-level rate-limiting middleware (`rate-limit.ts`). Covers the three shared budgets (global browsing, API-key, upload), their default ratios, key-generation helpers (`addressBlockOf`, `identityOf`), the skip/exemption logic for health-check probes, and the refusal path (`refuseRateLimited`) including its 429 envelope, metrics increment, audit recording, and logging.

## Key elements

- **Budget ratio assertions** — pins `DEFAULT_UPLOAD_RATE_LIMIT_MAX < DEFAULT_RATE_LIMIT_MAX / 2` and `DEFAULT_API_KEY_RATE_LIMIT_MAX` between upload and 2× browsing.
- **Global budget `skip` tests** — verifies GET `/readyz` and GET `/livez` are exempt; all other method/path combinations are not.
- **`addressBlockOf` tests** — IPv4 → /24, IPv6 → /48, IPv4-mapped (`::ffff:x`) resolves to the same /24, hex-spelled mapped addresses handled, `undefined` IP → stable `"unknown"` key.
- **`identityOf` tests** — email/username is normalised (case-folded, trimmed) and hashed *not* as bare SHA-256; non-string/blank email falls back to `anon:<block>`; username used when email is absent.
- **`refuseRateLimited` tests** — increments `rateLimitRefusalsTotal` per namespace, records one `SECURITY_RATE_LIMIT_HIT` audit when `audited: true`, skips audit when false, still returns 429 with `RATE_LIMITED` problem-details envelope, and calls `logger.warn`.
- **`budgetNamed` helper** — looks up a budget by name from `INFRASTRUCTURE_RATE_LIMITS`, throws if absent.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — system under test; all exported helpers and the `INFRASTRUCTURE_RATE_LIMITS` array are exercised here.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is mocked (partial mock keeps real `coreAuditActions` so a rename fails the assertion); tests assert call count and shape.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is spied on to confirm a refusal is always logged regardless of the `audited` flag.
- **`src/infrastructure/observability/metrics-rate-limit.ts`** — `rateLimitRefusalsTotal` Prometheus counter is read to verify per-namespace increment and cross-namespace isolation.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t` is imported (used by the SUT for the problem-details `title` string); tests assert the literal `"Too Many Requests"` output.
- **`tests/support/stub.ts`** — `asStub` is used to build minimal `Request`/`Response` objects without pulling in a full Express instance.

## Notes

- **No bare SHA-256 in keys.** `identityOf` deliberately produces a keyed/hmac'd digest so a Redis dump cannot be dictionary-attacked. The test explicitly asserts the output differs from `sha256(email)`.
- **IPv4-mapped IPv6 gotcha.** Node's dual-stack listener surfaces IPv4 callers as `::ffff:a.b.c.d`; the /24 mask must catch both the dotted-quad and the hex (`::ffff:cb00:7105`) spellings.
- **Block vs. library default.** `addressBlockOf` must stay *coarser* than `express-rate-limit`'s default `ipKeyGenerator` (which masks IPv6 to /56). A test pins this relationship so tightening the default doesn't silently change bucketing.
- **Audit mock is partial.** `jest.requireActual` is spread so `coreAuditActions` stays the real enum — renaming an action string will fail these tests.
- **Integration concern excluded.** The file header notes that a full `express-rate-limit` middleware pass-through is an integration test (`no-restricted-imports` enforces the boundary); this file only exercises the pure helpers and the refusal handler in isolation.
- **Cross-cutting budget tests live elsewhere.** The "stays a small fraction of the browsing budget" relationship across modules is in `tests/cross-cutting/rate-limit-budgets.test.ts`, not here.
