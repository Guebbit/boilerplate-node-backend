/**
 * Global test bootstrap — jest's `setupFiles`, so this runs ONCE per worker BEFORE any test
 * module is imported.
 *
 * That ordering is the whole reason the file exists. Everything configured here is read at
 * IMPORT time by the module that needs it: `rate-limit.ts` builds each limiter when it is first
 * imported, and `@infrastructure/i18n` must have its resources loaded before any zod schema
 * evaluates a message thunk. Setting these in a `beforeAll` would be too late — the modules
 * under test would already have captured the defaults.
 *
 * Note what is NOT here: no database. Mongo is per-suite, through `setupTestDb()`, because not
 * every suite needs one and starting a mongod for a pure-function test is pure cost.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { bootI18n } from '@infrastructure/i18n';
import { registerValidationMessages } from '@infrastructure/http/validation-messages';

/**
 * 10x the live default (`DEFAULT_RATE_LIMIT_MAX` in src/infrastructure/http/middlewares/rate-limit.ts, currently 100).
 *
 * A suite issues far more requests than a person does, and every one of them shares a single
 * source address, so the per-IP limiter sees one very busy client. Without this the later tests
 * fail with 429s that have nothing to do with what they assert.
 *
 * Raised rather than disabled, so a runaway loop still terminates — and written as a literal
 * rather than imported from `rate-limit.ts`, because importing that module here would evaluate
 * `buildRateLimiter()` before this line had a chance to set the variable it reads.
 *
 * The number tracks the FUZZ suite, which is what actually sets the floor: it fires
 * `RUNS_PER_OPERATION` requests at every non-multipart operation in the contract, from one
 * address, inside one window. At 12 runs an operation that is roughly 12 × (operations + auth
 * setup), so the budget has to stay comfortably ahead of the endpoint count. It was raised from
 * 1000 to 2000 when `inventory` grew from two endpoints to five and the last operation in the
 * run started answering 429 — a status no endpoint declares, so the contract assertion failed
 * and pointed here rather than at anything real. If a future module tips it again, raise it
 * again; a rate limit is not what the fuzz suite is testing.
 */
process.env.NODE_RATE_LIMIT_MAX ??= '2000';

/**
 * Same reasoning for the two credential budgets (`credentialLimiters`), which are deliberately much
 * smaller — failed attempts per account and per address per minute. Suites drive login, signup and
 * reset far harder than a person does, from one address, and the concurrency test alone fires
 * twenty deliberately-invalid signups at once.
 *
 * BOTH are raised, or raising one just moves which of them the suite trips over.
 *
 * Raised rather than disabled, so a test that accidentally loops on a credential endpoint still
 * terminates — and so the limiters' own tests can still reach them by setting a lower value.
 */
process.env.NODE_AUTH_RATE_LIMIT_MAX ??= '1000';
process.env.NODE_AUTH_RATE_LIMIT_ADDRESS_MAX ??= '1000';
process.env.NODE_AUTH_RATE_LIMIT_BLOCK_MAX ??= '1000';

/**
 * `submissionLimiter` (`POST /feedback/contact`) needs the same treatment, for a sharper reason
 * than the credential budgets above: it spends its budget on a SUCCESSFUL request, so — unlike
 * `credentialLimiters`, which only a failing suite run trips — every green contract and fuzz run
 * that posts a contact request more than `SUBMISSION_ADDRESS_BUDGET`'s default (5) times from one
 * address would trip it too. Its two Rung-1 siblings (identity, address block — `contactLimiters`)
 * spend on success the same way, so they need the same raise.
 */
process.env.NODE_SUBMISSION_RATE_LIMIT_MAX ??= '1000';
process.env.NODE_SUBMISSION_RATE_LIMIT_EMAIL_MAX ??= '1000';
process.env.NODE_SUBMISSION_RATE_LIMIT_BLOCK_MAX ??= '1000';

/**
 * `signupLimiters` and `resetRequestLimiters` (`POST /account/signup`, `POST /account/reset`)
 * spend on success for the same reason `submissionLimiter` does — a Sybil signup and a
 * mail-bombing reset request both get a 2xx — so every one of their six budgets needs the same
 * raise, or a suite that signs up or requests a reset more than a handful of times from one
 * address trips a 429 that has nothing to do with what it's testing.
 */
process.env.NODE_SIGNUP_RATE_LIMIT_MAX ??= '1000';
process.env.NODE_SIGNUP_RATE_LIMIT_ADDRESS_MAX ??= '1000';
process.env.NODE_SIGNUP_RATE_LIMIT_BLOCK_MAX ??= '1000';
process.env.NODE_RESET_RATE_LIMIT_MAX ??= '1000';
process.env.NODE_RESET_RATE_LIMIT_ADDRESS_MAX ??= '1000';
process.env.NODE_RESET_RATE_LIMIT_BLOCK_MAX ??= '1000';

/**
 * `uploadLimiter` needs the same treatment, for the same reason `submissionLimiter` does: it
 * spends its budget on a SUCCESSFUL upload, and any suite calling signup, product-create or
 * account-update with an image more than `DEFAULT_UPLOAD_RATE_LIMIT_MAX` (20) times from one
 * address inside a window would trip it on an otherwise-passing run.
 */
process.env.NODE_UPLOAD_RATE_LIMIT_MAX ??= '1000';

/**
 * `webhookLimiter` needs the same treatment: the payments contract suite delivers well past
 * `WEBHOOK_BUDGET`'s default (60) from one address inside a window.
 */
process.env.NODE_PAYMENT_WEBHOOK_RATE_LIMIT_MAX ??= '1000';

/**
 * `paymentConfirmAttemptLimiter`/`paymentConfirmDeclineLimiter` need the same treatment: keyed on
 * the ACCOUNT rather than the address, so a suite that logs into one seeded account and confirms
 * several payments would otherwise trip a 429 the fuzz suite's spec check does not expect — same
 * failure mode `NODE_AUTH_RATE_LIMIT_MAX` exists to prevent above.
 */
process.env.NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX ??= '1000';
process.env.NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX ??= '1000';

/**
 * `invoiceLimiter` needs the same treatment: keyed on the ACCOUNT, and the orders contract suite
 * downloads the same seeded order's invoice repeatedly across many cases.
 */
process.env.NODE_INVOICE_RATE_LIMIT_MAX ??= '1000';

/**
 * The shared window every limiter above measures against
 * (`DEFAULT_RATE_LIMIT_WINDOW_MS`, one minute) — raised tenfold for the same reason as the
 * budgets themselves: a suite spends a window's worth of requests in milliseconds, so a
 * real one-minute window would roll over mid-run and leave two requests fired a heartbeat
 * apart reading inconsistent budgets.
 */
process.env.NODE_RATE_LIMIT_WINDOW_MS ??= '600000';

/**
 * `mfaSendLimiter` needs the same treatment as the budgets above, on a FIXED ten-minute window
 * of its own (`account/rate-limits.ts` does not read `NODE_RATE_LIMIT_WINDOW_MS` for it) — a suite that
 * resends more than a handful of times against one live challenge would otherwise trip a 429
 * unrelated to what it is testing.
 *
 * `NODE_MFA_CHALLENGE_MAX` is deliberately NOT raised alongside it: `two-factor.test.ts`'s
 * "kills the challenge after too many wrong attempts" case fires 6 concurrent guesses at ONE
 * challenge specifically to prove `mfaChallengeLimiter`'s tight production default (5) still
 * catches them regardless of how generous the credential budgets above are — raising it here
 * would make that assertion untestable rather than merely more permissive.
 */
process.env.NODE_MFA_SEND_MAX ??= '1000';

/**
 * `apiKeyLimiter` needs the same treatment: keyed on the credential rather than the address, so
 * a suite driving many requests under one seeded api-key would otherwise trip a 429 the fuzz
 * suite's spec check does not expect.
 */
process.env.NODE_API_KEY_RATE_LIMIT_MAX ??= '1000';

/**
 * `passwordCheckLimiter` needs the same treatment: `POST /account/password/check` fires on every
 * debounced keystroke pause in a real client, so a suite exercising the live meter more than
 * `PASSWORD_CHECK_BUDGET`'s default (20) times from one address would trip a 429 that has
 * nothing to do with what it is testing.
 */
process.env.NODE_PASSWORD_CHECK_RATE_LIMIT_MAX ??= '1000';

/**
 * Bank transfer at checkout, which `GET /payments/methods` offers only where a deployment names
 * both of these. Set here rather than left to a developer's `.env`: the `shop` scenario declares
 * an `order.awaitingTransfer` guarantee, so a suite that builds it against an unconfigured
 * environment fails on a missing payment method rather than on anything it is testing.
 */
process.env.NODE_BANK_TRANSFER_BENEFICIARY ??= 'Guebbit Demo Shop';
process.env.NODE_BANK_TRANSFER_IBAN ??= 'IT60X0542811101000000123456';

/**
 * The shop's own jurisdiction and its two VAT rates — required in production, and `products/tax.ts`
 * resolves real tax arithmetic from them, so a suite asserting an actual amount needs a real pair
 * here rather than the code's own `0.22`/`0.1` fallback (which would pass silently even if a
 * test's expectation and the fallback happened to agree by coincidence).
 */
process.env.NODE_SHOP_COUNTRY ??= 'IT';
process.env.NODE_VAT_RATE_DEFAULT ??= '0.22';
process.env.NODE_VAT_RATE_REDUCED ??= '0.10';

/**
 * The limiters count IN MEMORY here, never in Redis.
 *
 * Not a preference — a requirement. `src/app.ts` imports `dotenv/config`, so `.env` reaches the
 * suite, and its `NODE_REDIS_URL` names a compose hostname that does not resolve from a test
 * runner. The limiters would then fail open on every request (`passOnStoreError`, deliberately),
 * and every case asserting a 429 would fail for a reason that has nothing to do with the code
 * under test.
 *
 * It is also the right answer on its own terms: a suite that shares counters with whatever else is
 * talking to that Redis is a suite whose result depends on who else is running.
 */
process.env.NODE_RATE_LIMIT_REDIS_ENABLED ??= '0';

/**
 * Rung 2 of the breached-password check (`checkHibpRange`) is a REAL outbound call to
 * `api.pwnedpasswords.com`. This project's own `.env` turns it on so the demo exercises it, but a
 * suite must never depend on a live third party — it is slow enough to distort a race assertion
 * (`auth-races.test.ts` saw its atomic-claim test flip under the added latency), and it fails for a
 * reason that has nothing to do with the code under test the moment the runner has no egress.
 *
 * `??=`, not a plain assignment: `../unit/infrastructure/security/breached-passwords/index.test.ts`
 * still turns it on inside individual cases, after this file has already run, to test rung 2 with
 * a faked `fetch` — never a live call either way.
 */
process.env.NODE_PASSWORD_BREACH_HIBP ??= 'off';

/**
 * The Prometheus scrape credential. `/observability/metrics` denies by default when this is
 * unset — an unauthenticated metrics endpoint is not a state to arrive at by forgetting a
 * variable — so the suite has to set one to reach it at all.
 */
process.env.NODE_METRICS_TOKEN ??= 'test-metrics-token';

/**
 * JWT signing secrets. `src/modules/account/session/config.ts` defaults both to `''` when unset,
 * and `jsonwebtoken.sign()` throws `secretOrPrivateKey must have a value` on an empty secret — so
 * any suite that signs in for real (`tests/contract`, most of `tests/integration`) needs these
 * set before the first login. A local `.env` supplies them via `dotenv/config` in `src/app.ts`;
 * CI has no `.env`, which is exactly what left `test-contract` failing there.
 */
process.env.NODE_TOKEN_ACCESS ??= 'test-access-secret';
process.env.NODE_TOKEN_REFRESH ??= 'test-refresh-secret';

/** Same reasoning as the two secrets above — `account/two-factor/` needs a real value too. */
process.env.NODE_TOTP_ENCRYPTION_KEY ??= 'test-totp-encryption-key';

/** Same reasoning again — a webhook subscription's secret ring (`modules/webhooks/secrets.ts`). */
process.env.NODE_WEBHOOK_SECRET_ENCRYPTION_KEY ??= 'test-webhook-secret-encryption-key';

/** Same reasoning again — address-book and user-phone PII (`src/infrastructure/security/pii-encryption.ts`). */
process.env.NODE_PII_ENCRYPTION_KEY ??= 'test-pii-encryption-key';

/**
 * Same again for the payment webhook: signing and verifying both refuse an absent secret, which is
 * the right production behaviour and would otherwise fail every webhook suite in CI.
 */
process.env.NODE_PAYMENT_WEBHOOK_SECRET ??= 'test-payment-webhook-secret';

/**
 * Declares this environment mail-capable, which is what gates the `email` second factor
 * (`account/two-factor/methods/email.ts`). Nothing is actually delivered — nodemailer runs on
 * `jsonTransport` under `NODE_ENV=test` — but a suite that could not enroll the method would be
 * testing the deployment check rather than the factor.
 */
process.env.NODE_SMTP_HOST ??= 'smtp.test.invalid';

/**
 * WARNING: it's async — and it runs in `setupFiles`, i.e. BEFORE the test file imports anything.
 *
 * That ordering is exactly what hid the failure: under Jest, i18next is up by the time a
 * module-scope `t()` runs, so eagerly-resolved Zod messages worked here and only here. Tests that
 * assert on translated messages must therefore not rely on this — see each module's own
 * `validation-messages` spec, which initialises its own instance through `@tests/i18n-boot`.
 */
/*
 * The same wiring `app.ts` does at boot: a module carries its own strings, and
 * `loadLocaleResources()` below only sees them once the directories are registered. Without this,
 * every test asserting on a domain message resolves the raw key instead of the copy.
 *
 * The directories are read off DISK rather than from `enabledModules`, and that is not a shortcut.
 * This file runs in `setupFiles`, before the test framework is installed, so importing the module
 * registry here would load every module before any `jest.mock` could intercept it — which silently
 * un-mocks repositories and services across unrelated suites. A glob knows the folder layout; an
 * import knows the whole application.
 */
const MODULES_ROOT = path.join(__dirname, '../../src/modules');
void bootI18n(
    readdirSync(MODULES_ROOT)
        .map((name) => path.join(MODULES_ROOT, name, 'locales'))
        .filter((directory) => existsSync(directory)),
    'en'
);

/*
 * The other half of `app.ts`'s boot: without it, Zod answers its own English here and the suite
 * would be asserting behaviour the running service does not have.
 */
registerValidationMessages();
