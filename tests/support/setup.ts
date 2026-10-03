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
// First, and for its side effect alone: it must write the environment before any import below
// can read it. See the file's own header.
import './setup-environment';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { bootI18n } from '@infrastructure/i18n';
import { registerValidationMessages } from '@infrastructure/http/validation-messages';
// The leaf module, NOT `@infrastructure/adapters/mailer` — that file also imports `nodemailer`,
// and this runs in `setupFiles`, before a test file's own `jest.mock('nodemailer', …)` is even
// hoisted. Importing the mailer here would hand every mocking test file an already-evaluated,
// un-mockable `nodemailer` — see `template-registry.ts`'s own header.
import { registerTemplateDirectories } from '@infrastructure/adapters/template-registry';
import { MODULES_ROOT } from '@tests/paths';

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

/*
 * The third half of `app.ts`'s boot: without it, `templateFile()` throws on every name a
 * suite's own `sendTemplatedEmail`/`enqueueEmail` call tries to resolve, since nothing has
 * collected the per-module directories yet. Globbed off disk for the same reason `bootI18n`'s
 * directories are, above — importing `enabledModules` here would load every module before any
 * `jest.mock` in an individual test file could intercept it.
 */
registerTemplateDirectories(
    readdirSync(MODULES_ROOT)
        .map((name) => path.join(MODULES_ROOT, name, 'templates'))
        .filter((directory) => existsSync(directory))
);

/*
 * DNS, for the webhook URL check (`webhooks/services/subscriptions.ts`) and every suite that
 * subscribes to a URL like `https://example.test/inbox`: a public address for any name, so no
 * test depends on a real resolver — or on the network being there. A suite that needs a private
 * or failing answer mocks `node:dns/promises` itself; a test file's own `jest.mock` wins.
 */
jest.mock('node:dns/promises', () => ({
    // The rest of the module stays real — `Resolver` (the MX policy) is not what this stands in for.
    ...jest.requireActual<typeof import('node:dns/promises')>('node:dns/promises'),
    resolve4: jest.fn(() => Promise.resolve(['93.184.216.34'])),
    resolve6: jest.fn(() =>
        Promise.reject(Object.assign(new Error('no AAAA'), { code: 'ENODATA' }))
    )
}));
