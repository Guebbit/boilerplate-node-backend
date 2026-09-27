---
source: src/infrastructure/http/middlewares/rate-limit.ts
sha256: 95a0a74ca479a06f92df735d618f9cd2561c8030394e6eb5a749e3fc97abd75c
generated_at: 2026-09-27T14:10:14.903268+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit.ts

## Purpose

Central factory and shared keying helpers for all rate-limit budgets in the app. Owns the three budgets no single module claims (global burst brake, api-key credential budget, image-upload budget) and exports `buildRateLimiter`, the one factory every module's own `rate-limits.ts` budget also flows through. Every refusal is answered via the shared error envelope (429) rather than `express-rate-limit`'s plain-text body.

## Key elements

- **`buildRateLimiter(budget)`** – Turns a `RateLimitBudget` descriptor into an Express `RequestHandler`. Wires the shared store, env-var-driven limits, `draft-7` headers, `passOnStoreError: true` (fail open), and the `refuse` handler.
- **`rateLimiter`** – The global browsing brake (per-address, whole surface). Mounted in `app/security.ts`. Skips `GET /readyz`.
- **`apiKeyLimiter`** – Per-credential budget for api-key authenticated requests. Runs inside `getAuth`'s credential branch.
- **`uploadLimiter`** – Per-address image-upload budget shared by `account`, `products`, and `users` modules.
- **`addressBlockOf(request)`** – Widens the caller IP to an IPv4 /24 or IPv6 /64 bucket. Fallback key for any budget with no identifying field.
- **`identityOf(request)`** – Hashed, normalized email/username key; falls back to `addressBlockOf` when the body names nobody.
- **`accountIdOf(request)`** – Key generator for account-keyed budgets (reads `request.authContext!.id`).
- **`readBodyField(request, field)`** – Single shape-safe extractor for a string field off `request.body`.
- **`rateLimitInfoOf(request, property)`** – Reads the budget's `RateLimitInfo` back off the request for downstream gates.
- **`KEYED_BY_*` constants** – Stable label strings consumed by the doc generator for the budgets table.
- **`DEFAULT_RATE_LIMIT_*` constants** – Fallbacks when the corresponding `NODE_*` env var is unset.
- **`refuse(audit)`** – (internal) Returns a 429 via `refuseAntibot`; optionally records an audit event first.

## Relationships

- **`rate-limit-store.ts`** – Provides `rateLimitStore(namespace)`, the single Redis-or-memory backing store for every budget.
- **`app/security.ts`** – Mounts `rateLimiter` globally before route-level limiters.
- **`antibot-log.ts`** – `refuseAntibot` is the transport for every 429 response emitted here.
- **`request.ts`** – Supplies `callerContextOf` so the audit call in `refuse` can stamp the actor.
- **`i18n/index.ts`** – `t('generic.error-rate-limited')` localizes the refusal message.
- **`observability/audit.ts`** – `recordAudit` / `coreAuditActions.SECURITY_RATE_LIMIT_HIT` for audited refusals (credential budgets).
- **`normalize-email.ts`** – Normalizes the email/username in `identityOf` so casing/spelling variants share one bucket.
- **`runtime/environment.ts`** – `environmentNumber` reads `NODE_RATE_LIMIT_MAX`, `NODE_API_KEY_RATE_LIMIT_MAX`, `NODE_RATE_LIMIT_WINDOW_MS`, etc.
- **`modules/account/rate-limits.ts`**, **`modules/feedback/rate-limits.ts`** – Define module-owned `RateLimitBudget` objects and call `buildRateLimiter`, `identityOf`, `addressBlockOf`, `accountIdOf`, `readBodyField`.
- **`modules/account/routes.ts`** – Mounts `uploadLimiter` on image-upload routes.
- **`kernel/middlewares/authorizations.ts`** – `getAuth` runs before `accountIdOf` is invoked, guaranteeing `authContext` is populated.
- **`scripts/docs/generate-rate-limit-budgets.ts`** – Imports the budget descriptors and `KEYED_BY_*` labels to render the security-docs table.
- **`modules/account/tests/unit/rate-limits.test.ts`** – Unit-tests the account module's budgets built on this file's helpers.

## Notes

- **Fail open, not closed.** `passOnStoreError: true` means a Redis outage lets requests through rather than returning 500. The outage is logged at `error` once.
- **Audit is opt-in per budget.** Credential budgets (`apiKeyLimiter`) audit every refusal; the global brake does not (a port scan would bury the trail in noise).
- **`skipSuccessfulRequests` defaults to `false`.** For the upload budget this is intentional: a well-formed upload is the expensive case (CPU in the image-digest pipeline), so it must count.
- **`identityOf` falls back to address block, not a shared bucket.** A multipart body is unparsed when a limiter runs; a single shared "unknown" bucket would let five junk uploads lock every multipart signup site-wide.
- **Test suites raise the window 10×** (see `tests/support/setup.ts`) so test traffic doesn't trip budgets.
- **`accountIdOf` uses a non-null assertion** on `request.authContext`—safe only because `getAuth` (via `isAuth`) has already proven it. Do not call this helper on an unauthenticated path.
- **IPv4 /24 mask is hand-rolled** (no library equivalent); IPv6 /64 reuses `express-rate-limit`'s internal `ipKeyGenerator`.
