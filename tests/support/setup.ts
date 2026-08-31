/**
 * Global test bootstrap — jest's `setupFiles`, so this runs ONCE per worker BEFORE any test
 * module is imported.
 *
 * That ordering is the whole reason the file exists. Everything configured here is read at
 * IMPORT time by the module that needs it: `security.ts` builds its rate limiters when it is
 * first imported, and `@infrastructure/i18n` must have its resources loaded before any zod schema
 * evaluates a message thunk. Setting these in a `beforeAll` would be too late — the modules
 * under test would already have captured the defaults.
 *
 * Note what is NOT here: no database. Mongo is per-suite, through `setupTestDb()`, because not
 * every suite needs one and starting a mongod for a pure-function test is pure cost.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import i18next from 'i18next';
import {
    getFallbackLocale,
    listSupportedLocales,
    loadLocaleResources,
    registerLocaleDirectories
} from '@infrastructure/i18n';
import { registerValidationMessages } from '@infrastructure/http/validation-messages';

/**
 * 10x the live default (`DEFAULT_RATE_LIMIT_MAX` in src/infrastructure/http/middlewares/rate-limit.ts, currently 100).
 *
 * A suite issues far more requests than a person does, and every one of them shares a single
 * source address, so the per-IP limiter sees one very busy client. Without this the later tests
 * fail with 429s that have nothing to do with what they assert.
 *
 * Raised rather than disabled, so a runaway loop still terminates — and written as a literal
 * rather than imported from `security.ts`, because importing that module here would evaluate
 * `rateLimit()` before this line had a chance to set the variable it reads.
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

/**
 * `submissionLimiter` (`POST /feedback/contact`) needs the same treatment, for a sharper reason
 * than the credential budgets above: it spends its budget on a SUCCESSFUL request, so — unlike
 * `credentialLimiters`, which only a failing suite run trips — every green contract and fuzz run
 * that posts a contact request more than `DEFAULT_SUBMISSION_RATE_LIMIT_MAX` (5) times from one
 * address would trip it too.
 */
process.env.NODE_SUBMISSION_RATE_LIMIT_MAX ??= '1000';

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

//
//
/**
 * Use a pre-installed mongod binary when available (set by `npm run setup:mongod`).
 * If the binary is absent, mongodb-memory-server will download it automatically at runtime.
 * So first run may be slow (download is 100mb)
 */
const systemBinary = process.env.MONGOMS_SYSTEM_BINARY ?? '/tmp/mongod';
if (existsSync(systemBinary)) {
    process.env.MONGOMS_SYSTEM_BINARY = systemBinary;
    process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false';
    process.env.MONGOMS_MD5_CHECK = 'false';
}

/**
 * WARNING: it's async — and it runs in `setupFiles`, i.e. BEFORE the test file imports anything.
 *
 * That ordering is exactly what hid PROBLEM 01: under Jest, i18next is up by the time a
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
registerLocaleDirectories(
    readdirSync(MODULES_ROOT)
        .map((name) => path.join(MODULES_ROOT, name, 'locales'))
        .filter((directory) => existsSync(directory))
);

void i18next.init({
    lng: 'en',
    fallbackLng: getFallbackLocale(),
    supportedLngs: listSupportedLocales(),
    resources: loadLocaleResources()
});

/*
 * The other half of `app.ts`'s boot: without it, Zod answers its own English here and the suite
 * would be asserting behaviour the running service does not have.
 */
registerValidationMessages();
