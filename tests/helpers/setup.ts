/**
 * Global test bootstrap — jest's `setupFiles`, so this runs ONCE per worker BEFORE any test
 * module is imported.
 *
 * That ordering is the whole reason the file exists. Everything configured here is read at
 * IMPORT time by the module that needs it: `security.ts` builds its rate limiters when it is
 * first imported, and `@core/i18n` must have its resources loaded before any zod schema
 * evaluates a message thunk. Setting these in a `beforeAll` would be too late — the modules
 * under test would already have captured the defaults.
 *
 * Note what is NOT here: no database. Mongo is per-suite, through `setupTestDb()`, because not
 * every suite needs one and starting a mongod for a pure-function test is pure cost.
 */
import { existsSync } from 'node:fs';
import i18next from 'i18next';
import { getFallbackLocale, listSupportedLocales, loadLocaleResources } from '@core/i18n';

/**
 * 10x the live default (`DEFAULT_RATE_LIMIT_MAX` in src/middlewares/security.ts, currently 100).
 *
 * A suite issues far more requests than a person does, and every one of them shares a single
 * source address, so the per-IP limiter sees one very busy client. Without this the later tests
 * fail with 429s that have nothing to do with what they assert.
 *
 * Raised rather than disabled, so a runaway loop still terminates — and written as a literal
 * rather than imported from `security.ts`, because importing that module here would evaluate
 * `rateLimit()` before this line had a chance to set the variable it reads.
 */
process.env.NODE_RATE_LIMIT_MAX ??= '1000';

/**
 * Same reasoning for the credential-endpoint budget (`authRateLimiter`), which is deliberately
 * much smaller — ten failed attempts per IP per minute. Suites drive login, signup and reset far
 * harder than a person does, from one address, and the concurrency test alone fires twenty
 * deliberately-invalid signups at once.
 *
 * Raised rather than disabled, so a test that accidentally loops on a credential endpoint still
 * terminates — and so the limiter's own tests can still reach it by setting a lower value.
 */
process.env.NODE_AUTH_RATE_LIMIT_MAX ??= '1000';

/**
 * The Prometheus scrape credential. `/observability/metrics` denies by default when this is
 * unset — an unauthenticated metrics endpoint is not a state to arrive at by forgetting a
 * variable — so the suite has to set one to reach it at all.
 */
process.env.NODE_METRICS_TOKEN ??= 'test-metrics-token';

//
//
/**
 * Use a pre-installed mongod binary when available (set by `npm run setup:mongod`).
 * If the binary is absent, mongodb-memory-server will download it automatically at runtime.
 * So first run may be slow (download is 100mb)
 */
const systemBinary = process.env['MONGOMS_SYSTEM_BINARY'] ?? '/tmp/mongod';
if (existsSync(systemBinary)) {
    process.env['MONGOMS_SYSTEM_BINARY'] = systemBinary;
    process.env['MONGOMS_SYSTEM_BINARY_VERSION_CHECK'] = 'false';
    process.env['MONGOMS_MD5_CHECK'] = 'false';
}

/**
 * WARNING: it's async — and it runs in `setupFiles`, i.e. BEFORE the test file imports anything.
 *
 * That ordering is exactly what hid PROBLEM 01: under Jest, i18next is up by the time a
 * module-scope `t()` runs, so eagerly-resolved Zod messages worked here and only here. Tests that
 * assert on translated messages must therefore not rely on this — see
 * `tests/unit/i18n/validation-messages.test.ts`, which initialises its own instance.
 */
void i18next.init({
    lng: 'en',
    fallbackLng: getFallbackLocale(),
    supportedLngs: listSupportedLocales(),
    resources: loadLocaleResources()
});
