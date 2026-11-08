---
source: tests/support/setup-environment.ts
sha256: 396c51fca148cf701f491e7007d214eb6a5d91df76ae88477c51513130048f18
generated_at: 2026-11-08T09:59:51.074538+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-environment.ts

## Purpose

Sets default `process.env` values (via `??=`) for the Jest test worker before any test code loads. It exists as a separate file imported *first* (jest `setupFiles`) so that its writes land before the config store snapshots `process.env` during the i18n/validation imports in `setup.ts`. Every value is a default — a real environment variable always wins.

## Key elements

- **Rate-limit budget raises** — Every limiter budget (`NODE_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_*`, `NODE_SUBMISSION_RATE_LIMIT_*`, `NODE_SIGNUP_RATE_LIMIT_*`, `NODE_RESET_RATE_LIMIT_*`, `NODE_UPLOAD_RATE_LIMIT_MAX`, `NODE_PAYMENT_*`, `NODE_INVOICING_*`, `NODE_ORDER_EXPORT_*`, `NODE_ORDER_NOTE_*`, `NODE_MAIL_RECIPIENT_*`, `NODE_CHECKOUT_*`, `NODE_RETURNS_*`, `NODE_EXAMPLE_*`, `NODE_CART_MERGE_*`, `NODE_API_KEY_*`, `NODE_PASSWORD_CHECK_*`, `NODE_MFA_SEND_*`) is raised to **10 000** (general) or **1 000** (per-endpoint) so suites that fire many requests from one address or one account do not hit 429s unrelated to the assertion.
- **`NODE_RATE_LIMIT_WINDOW_MS`** — Raised to 600 000 ms (10 min) so the window doesn't roll over mid-run and produce inconsistent budget reads.
- **`NODE_MFA_CHALLENGE_MAX`** — Deliberately **not** raised; `two-factor.test.ts` asserts the tight production default (5) still catches concurrent wrong guesses.
- **`NODE_RATE_LIMIT_REDIS_URL`** — Forced to `''` (blank) before `dotenv/config` runs, guaranteeing in-memory counting and preventing a compose-hostname Redis URL in `.env` from breaking every 429 assertion.
- **Shop identity & legal defaults** — `NODE_LEGAL_COUNTRY`, `NODE_SHOP_TIMEZONE`, `NODE_LEGAL_NAME/STREET/CITY/ZIP`, `NODE_SUPPORT_EMAIL`, `NODE_LEGAL_PHONE`, `NODE_VAT_RATE_DEFAULT` (0.22), `NODE_VAT_RATE_REDUCED` (0.10) — required by `products/tax.ts` for real tax arithmetic.
- **Bank-transfer fields** — `NODE_BANK_TRANSFER_BENEFICIARY` and `NODE_BANK_TRANSFER_IBAN` set so the `shop` scenario's `order.awaitingTransfer` guarantee is satisfiable without a developer's `.env`.

## Relationships

- **`tests/support/setup.ts`** — Imports this file first (jest `setupFiles` ordering). All env writes here are visible before `setup.ts`'s subsequent imports (i18n, validation messages) trigger the config store's one-time `process.env` snapshot.

## Notes

- The file is a **write-only** module: no exports, no reads. Side effects on `process.env` are its sole contract.
- Values are **budgets only**; business rules (caps, per-line ceilings) are intentionally *not* raised here. A test that needs a looser rule must use `withEnvironmentOverrides`.
- The general rate-limit value (100 000) is a literal, not an import from `rate-limit.ts`, to avoid evaluating `buildRateLimiter()` before the env var is set.
- If a future module re-triggers a 429 in the fuzz suite, the convention is to raise the relevant budget here again rather than weaken the limiter in source.
- The file was truncated in the content provided; additional `NODE_*` defaults (e.g., per-query time limit) may follow.
