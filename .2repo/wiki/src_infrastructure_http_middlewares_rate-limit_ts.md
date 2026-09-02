# src/infrastructure/http/middlewares/rate-limit.ts

## Purpose

Defines every rate-limiting middleware in the application: a global per-address burst brake, two independent credential budgets (per-account and per-address), a contact-submission budget, an MFA-challenge budget, an image-upload budget, and a bearer-token guard for the Prometheus scrape endpoint. All limiters share one Redis-or-memory store and fail open on store errors.

## Key elements

- **`rateLimiter`** — Global burst brake (default 100 req/window/address). Mounted globally in `app/security.ts` so unmatched routes also count.
- **`credentialLimiters`** — Exported as a `RequestHandler[]` (two limiters): one bounds failed attempts per *named account* (default 10), the other per *calling address* (default 30). Both use `skipSuccessfulRequests` so only failures spend the budget.
- **`identityOf(request)`** — Extracts `email`/`username` from the body, normalises (trim, lowercase), and SHA-256-hashes it so the Redis key never contains a readable identifier.
- **`submissionLimiter`** — Bounds *successful* contact-form submissions (default 5/address/window). Does **not** skip successes, because the abuse pattern is repeated well-formed posts.
- **`mfaChallengeLimiter`** — Bounds attempts against a single still-live 6-digit challenge (default 5). Keyed on the challenge string itself; window is a fixed 300 s (matches `MFA_CHALLENGE_TTL_SECONDS`).
- **`uploadLimiter`** — Bounds image-upload requests (default 20/address/window). Spent by success, like `submissionLimiter`, because the cost is CPU-bound image processing.
- **`isMetricsScraper`** — Static bearer-token guard for the Prometheus scrape route. Denies when `NODE_METRICS_TOKEN` is unset; compares with `timingSafeEqual`.
- **`refuse(audit)`** / **`limiterOptions(store, audit)`** — Internal helpers producing the shared 429 response (via `rejectResponse` + i18n) and the common `express-rate-limit` option set.
- **Constants** (`DEFAULT_RATE_LIMIT_WINDOW_MS`, `DEFAULT_RATE_LIMIT_MAX`, `DEFAULT_AUTH_RATE_LIMIT_MAX`, `DEFAULT_AUTH_RATE_LIMIT_ADDRESS_MAX`, `DEFAULT_SUBMISSION_RATE_LIMIT_MAX`, `DEFAULT_UPLOAD_RATE_LIMIT_MAX`, `DEFAULT_MFA_CHALLENGE_MAX`) — Fallbacks used when the corresponding `NODE_*` env vars are absent.

## Relationships

- **`rate-limit-store.ts`** — Supplies the shared `rateLimitStore(name)` instance used by every limiter.
- **`app/security.ts`** — Mounts `rateLimiter` globally on the Express app.
- **`response.ts`** — `rejectResponse` formats the 429 error envelope.
- **`request.ts`** — `callerContextOf` provides identity metadata for audit events emitted in `refuse`.
- **`i18n`** — `t('generic.error-rate-limited')` supplies the client-facing message.
- **`observability/audit.ts`** — `emitAuditEvent` / `buildAuditEvent` / `coreAuditActions.SECURITY_RATE_LIMIT_HIT` are called when a credentialed route refuses a request.
- **`adapters/logger.ts`** — `logger.warn` / `logger.error` log the fail-open store-error path in `isMetricsScraper`.
- **`runtime/environment.ts`** — `environmentNumber` reads and validates every `NODE_*` budget override.
- **Route modules** (`account/routes.ts`, `feedback/routes.ts`, `observability/routes.ts`, `products/routes.ts`, `users/routes.ts`) — Consumers that attach `credentialLimiters`, `submissionLimiter`, `mfaChallengeLimiter`, `uploadLimiter`, or `isMetricsScraper` to specific handlers.
- **`tests/integration/auth-hardening.test.ts`** — Integration tests that exercise the credential and MFA budgets.

## Notes

- **Fail-open by design.** `passOnStoreError: true` means a Redis outage degrades to *no* rate limiting rather than a 500 auth outage. The first occurrence is logged at `error` level.
- **`credentialLimiters` is an array** because Express `app.use(...)` flattens arrays; a route cannot accidentally apply only one of the two.
- **`skipSuccessfulRequests`** is true only on the credential pair. Submission and upload limiters deliberately count successes, because the threat is a *valid* request repeated (email amplification, CPU saturation).
- **MFA window is hardcoded to 300 s** rather than importing `MFA_CHALLENGE_TTL_SECONDS` from the account module, to respect the `account → infrastructure` (not reverse) dependency direction. A cross-cutting test pins the two together.
- **Identity hashing.** The account key reaching Redis is a SHA-256 hex digest, so a `KEYS *` or RDB dump does not expose the user list.
- **Tests raise the window tenfold** (see `tests/support/setup.ts`) so integration suites do not hit the production budgets.
- **`isMetricsScraper` denies by default** when `NODE_METRICS_TOKEN` is unset — the observability endpoint is unreachable until a token is explicitly configured.
