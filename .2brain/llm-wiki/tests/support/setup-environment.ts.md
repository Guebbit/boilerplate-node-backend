---
source: tests/support/setup-environment.ts
sha256: bd6f3f43e44c08e6629bf302770de2569af38806dd8ed504002e4f95d96a396f
generated_at: 2026-10-15T13:01:49.257247+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-environment.ts

## Purpose

Jest `setupFiles` entry that runs **before** `setup.ts` and seeds `process.env` with permissive rate-limit budgets, shop identity, VAT rates, and other defaults so that test suites never trip production rate limiters or fail on missing configuration. It exists as a separate file (not inlined into `setup.ts`) because the config store snapshots `process.env` on first read, and `setup.ts`'s own imports (i18n, validation messages) may trigger that read; imports evaluate in order, so this file's writes land first.

## Key elements

- **No exports.** The module is a pure side-effect script: a sequence of `process.env.X ??= '<literal>'` assignments.
- **Rate-limit budget raises** (`NODE_RATE_LIMIT_MAX`, `NODE_AUTH_*`, `NODE_SUBMISSION_*`, `NODE_SIGNUP_*`, `NODE_RESET_*`, `NODE_UPLOAD_*`, `NODE_PAYMENT_*`, `NODE_INVOICING_*`, `NODE_ORDER_EXPORT_*`, `NODE_CHECKOUT_*`, `NODE_RETURNS_*`, `NODE_EXAMPLE_*`, `NODE_CART_MERGE_*`, `NODE_API_KEY_*`, `NODE_PASSWORD_CHECK_*`, `NODE_MFA_SEND_*`) — values of 10 000–100 000, well above any suite's request volume, but finite so a runaway loop still terminates.
- **`NODE_RATE_LIMIT_WINDOW_MS`** — raised to 600 000 ms (10 min) so a suite's sub-second burst never rolls over a window mid-run.
- **`NODE_RATE_LIMIT_REDIS_URL`** — set to `''` (empty string) to force in-memory limiting; a `.env` Redis URL would point at a compose hostname unresolvable in CI and would make every 429-asserting test fail for infra reasons.
- **Shop identity & VAT** (`NODE_SHOP_*`, `NODE_VAT_RATE_*`) — concrete Italian shop details and two VAT rates so tax arithmetic in `products/tax.ts` uses real values rather than its internal fallback.
- **Bank transfer** (`NODE_BANK_TRANSFER_*`) — beneficiary name and IBAN so `GET /payments/methods` exposes the method the `shop` scenario expects.
- **`NODE_MFA_CHALLENGE_MAX`** — deliberately **not** set; `two-factor.test.ts` needs the production default (5) to assert that the challenge-kill logic fires.

## Relationships

- **`tests/support/setup.ts`** — imports this module **first** (Jest `setupFiles` ordering). Without this ordering, `setup.ts`'s top-level imports of i18n and validation-message modules would trigger the config store's one-time `process.env` read before any write below has executed, and the seeds would be invisible to the rest of the suite.

## Notes

- **`??=` everywhere.** A developer's real environment variable always wins; these are defaults, not overrides.
- **Literals, not imports.** Budget values are hardcoded (e.g. `'100000'`) rather than imported from `rate-limit.ts` or other source modules, because importing those modules here would evaluate `buildRateLimiter()` before the corresponding env var is written, causing a read-before-write bug.
- **Raised, never disabled.** Limits stay finite so a test that accidentally loops on a credentialed endpoint still receives a 429 and terminates; the limiter's own unit tests set a lower value explicitly via `withEnvironment`.
- **Redis URL blank must be set before `dotenv/config` runs.** `src/app.ts` imports `dotenv/config`; a blank value written earlier takes precedence because `dotenv` does not overwrite existing keys.
- **The file is intentionally non-modular.** It has no named exports, no conditionals, and no imports beyond `node:os`/`node:path` (which appear in the source header but are only used if the truncated tail adds `tmpdir` paths). Do not refactor it into a function or class without also re-ordering `setup.ts`.
