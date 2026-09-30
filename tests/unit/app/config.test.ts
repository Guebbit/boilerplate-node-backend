/**
 * `APP_CONFIG_SLICES` — the app tier's own boot-time slices, folded into `assertModuleConfig`
 * (`@kernel/module-config`) by `src/app.ts`. The gate's own mechanism — collecting, reporting once,
 * skipping presence rules under test — is covered in `tests/unit/kernel/module-config.test.ts`;
 * this file only asserts what THESE slices are.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing at all.
 */
import { assertModuleConfig } from '@kernel/module-config';
import { APP_CONFIG_SLICES } from '@app/config';
import { enableDemoProfile } from '@infrastructure/runtime/demo-profile';
import { resetAnalyticsProvider } from '@infrastructure/observability/analytics';
import { withoutEnvironmentInThisFile } from '@tests/environment';

withoutEnvironmentInThisFile([
    'NODE_ENV',
    'NODE_URL',
    'NODE_CORS_ORIGIN',
    'NODE_PSEUDONYM_KEY',
    'NODE_SMTP_HOST',
    'NODE_SMTP_USER',
    'NODE_SMTP_PASS',
    'NODE_SMTP_SENDER',
    'NODE_ANALYTICS_PROVIDER',
    'NODE_MAIL_TRANSPORT',
    'NODE_E2E_RUN',
    'NODE_LOG_PERSONAL_FIELDS',
    'NODE_ANTIBOT_PROVIDER',
    'NODE_ANTIBOT_ALTCHA_SECRET',
    'NODE_ANTIBOT_TURNSTILE_SITE_KEY',
    'NODE_ANTIBOT_TURNSTILE_SECRET',
    'NODE_ANTIBOT_EMAIL_POLICY',
    'NODE_ANALYTICS_REQUIRE_CONSENT'
]);

/**
 * A deployment that satisfies every unconditional check — every other variable this file touches
 * is already cleared by `withoutEnvironmentInThisFile`'s own `beforeEach`.
 */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
    process.env.NODE_URL = 'https://api.example.com/';
};

/** `assertModuleConfig` wired the way `src/app.ts` wires it — the whole point of this file. */
const assertApp = (): void => assertModuleConfig([], APP_CONFIG_SLICES);

afterEach(() => {
    enableDemoProfile(false);
    // Memoised on first resolve — a case left over from a previous one would otherwise decide
    // this one, the same reason `analytics.test.ts` resets it in its own `beforeEach`.
    resetAnalyticsProvider();
});

describe('application-wide variables', () => {
    it('refuses to boot with no NODE_URL', () => {
        configure();
        delete process.env.NODE_URL;

        expect(assertApp).toThrow(/NODE_URL/);
    });

    it('ignores an unset NODE_CORS_ORIGIN outside production', () => {
        // `productionOnly`: the localhost fallback in `app/security.ts` is right for a developer
        // and certainly wrong for a deployment, so only the deployment is asked about it.
        configure();
        delete process.env.NODE_CORS_ORIGIN;

        expect(assertApp).not.toThrow();
    });

    it('refuses to boot in production with no NODE_CORS_ORIGIN', () => {
        configure();
        process.env.NODE_ENV = 'production';
        delete process.env.NODE_CORS_ORIGIN;

        expect(assertApp).toThrow(/NODE_CORS_ORIGIN/);
    });

    it.each([undefined, 'staging'])(
        'refuses to boot with NODE_ENV=%p and no NODE_CORS_ORIGIN: a server is not a developer',
        (value) => {
            configure();
            if (value === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = value;
            delete process.env.NODE_CORS_ORIGIN;

            expect(assertApp).toThrow(/NODE_CORS_ORIGIN/);
        }
    );

    it('ignores an unset NODE_PSEUDONYM_KEY outside production', () => {
        // `productionOnly`: the logger's own dev fallback key (`adapters/logger.ts`) is right for
        // a developer and certainly wrong for a deployment, so only the deployment is asked.
        configure();
        delete process.env.NODE_PSEUDONYM_KEY;

        expect(assertApp).not.toThrow();
    });

    it('refuses to boot in production with no NODE_PSEUDONYM_KEY', () => {
        configure();
        process.env.NODE_ENV = 'production';
        delete process.env.NODE_PSEUDONYM_KEY;

        expect(assertApp).toThrow(/NODE_PSEUDONYM_KEY/);
    });
});

describe('the SMTP group', () => {
    it('accepts mail left entirely unconfigured', () => {
        // Unconfigured is a supported choice — the email second factor reports itself unavailable.
        configure();

        expect(assertApp).not.toThrow();
    });

    it('refuses a host configured without its credentials', () => {
        configure();
        process.env.NODE_SMTP_HOST = 'mail.example.com';
        delete process.env.NODE_SMTP_USER;
        delete process.env.NODE_SMTP_PASS;
        delete process.env.NODE_SMTP_SENDER;

        expect(assertApp).toThrow(/NODE_SMTP_USER, NODE_SMTP_PASS, NODE_SMTP_SENDER/);
    });

    it('accepts a fully configured host', () => {
        configure();
        process.env.NODE_SMTP_HOST = 'mail.example.com';
        process.env.NODE_SMTP_USER = 'noreply@example.com';
        process.env.NODE_SMTP_PASS = 'secret';
        process.env.NODE_SMTP_SENDER = 'Example <noreply@example.com>';

        expect(assertApp).not.toThrow();
    });
});

/** A configured SMTP transport pointing at `host`, started as an e2e run. */
const e2eSmtp = (host: string): void => {
    configure();
    process.env.NODE_E2E_RUN = '1';
    process.env.NODE_MAIL_TRANSPORT = 'smtp';
    process.env.NODE_SMTP_HOST = host;
    process.env.NODE_SMTP_USER = 'x';
    process.env.NODE_SMTP_PASS = 'x';
    process.env.NODE_SMTP_SENDER = 'x@example.com';
};

describe('the mail guards', () => {
    it('refuses to boot outside development and test with NODE_MAIL_TRANSPORT unset', () => {
        configure();
        process.env.NODE_ENV = 'production';

        expect(assertApp).toThrow(/NODE_MAIL_TRANSPORT/);
    });

    it('refuses an unset NODE_ENV too, since unset is not development', () => {
        configure();
        delete process.env.NODE_ENV;

        expect(assertApp).toThrow(/NODE_MAIL_TRANSPORT/);
    });

    it.each(['smtp', 'log'])('accepts an explicit NODE_MAIL_TRANSPORT=%s in production', (name) => {
        configure();
        process.env.NODE_ENV = 'production';
        process.env.NODE_CORS_ORIGIN = 'https://app.example.com';
        process.env.NODE_PSEUDONYM_KEY = 'a-long-enough-pseudonym-key';
        process.env.NODE_MAIL_TRANSPORT = name;

        expect(assertApp).not.toThrow();
    });

    describe('an e2e run (NODE_E2E_RUN=1)', () => {
        it('refuses a real SMTP host', () => {
            e2eSmtp('smtp.example.com');

            expect(assertApp).toThrow(/NODE_SMTP_HOST=smtp\.example\.com is not a local mail sink/);
        });

        it('refuses smtp with no host at all', () => {
            e2eSmtp('');
            delete process.env.NODE_SMTP_HOST;

            expect(assertApp).toThrow(/\(unset\)/);
        });

        it.each(['localhost', '127.0.0.1', '::1', 'mailpit'])(
            'allows the local host %s',
            (host) => {
                e2eSmtp(host);

                expect(assertApp).not.toThrow();
            }
        );

        it.each(['log', 'outbox'])('allows %s whatever the SMTP host says', (name) => {
            e2eSmtp('smtp.example.com');
            process.env.NODE_MAIL_TRANSPORT = name;

            expect(assertApp).not.toThrow();
        });

        it('leaves a real host alone when the run is not an e2e run', () => {
            e2eSmtp('smtp.example.com');
            delete process.env.NODE_E2E_RUN;

            expect(assertApp).not.toThrow();
        });
    });
});

describe('the provider-selector group — refused at boot, not the first request', () => {
    it('refuses an unrecognized NODE_ANALYTICS_PROVIDER at boot', () => {
        configure();
        process.env.NODE_ANALYTICS_PROVIDER = 'not-a-provider';

        expect(assertApp).toThrow(/NODE_ANALYTICS_PROVIDER/);
    });

    it.each(['umami', 'posthog', 'none'])(
        'accepts a known NODE_ANALYTICS_PROVIDER (%s)',
        (name) => {
            configure();
            process.env.NODE_ANALYTICS_PROVIDER = name;

            expect(assertApp).not.toThrow();
        }
    );

    it('refuses an unrecognized NODE_MAIL_TRANSPORT at boot', () => {
        configure();
        process.env.NODE_MAIL_TRANSPORT = 'not-a-transport';

        expect(assertApp).toThrow(/NODE_MAIL_TRANSPORT/);
    });

    it.each(['smtp', 'log', 'outbox'])('accepts a known NODE_MAIL_TRANSPORT (%s)', (name) => {
        configure();
        process.env.NODE_MAIL_TRANSPORT = name;

        expect(assertApp).not.toThrow();
    });

    it('refuses an unrecognized NODE_LOG_PERSONAL_FIELDS at boot', () => {
        configure();
        process.env.NODE_LOG_PERSONAL_FIELDS = 'not-a-mode';

        expect(assertApp).toThrow(/NODE_LOG_PERSONAL_FIELDS/);
    });

    it.each(['hash', 'redact', 'plain'])(
        'accepts a known NODE_LOG_PERSONAL_FIELDS (%s)',
        (name) => {
            configure();
            process.env.NODE_LOG_PERSONAL_FIELDS = name;

            expect(assertApp).not.toThrow();
        }
    );

    it('refuses an unrecognized NODE_ANTIBOT_PROVIDER at boot, not the first guarded request', () => {
        configure();
        process.env.NODE_ANTIBOT_PROVIDER = 'not-a-provider';

        expect(assertApp).toThrow(/NODE_ANTIBOT_PROVIDER/);
    });
});

/*
 * Antibot's own checks (SK-06): moved here from `modules/antibot`'s manifest, since the
 * human-challenge gate they validate is cross-cutting middleware `account`/`feedback` call
 * directly — it keeps running whether or not antibot's two HTTP routes are even mounted, so
 * validating it cannot live on a manifest that deleting the module also deletes.
 */
describe('the antibot provider group', () => {
    it('asks for nothing while the rung is off — the default', () => {
        configure();

        expect(assertApp).not.toThrow();
    });

    it('refuses a self-hosted provider selected without its signing secret', () => {
        configure();
        process.env.NODE_ANTIBOT_PROVIDER = 'altcha';
        delete process.env.NODE_ANTIBOT_ALTCHA_SECRET;

        expect(assertApp).toThrow(/NODE_ANTIBOT_ALTCHA_SECRET/);
    });

    it('refuses a vendor provider missing either half of its key pair', () => {
        configure();
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';
        process.env.NODE_ANTIBOT_TURNSTILE_SITE_KEY = 'site-key';
        delete process.env.NODE_ANTIBOT_TURNSTILE_SECRET;

        expect(assertApp).toThrow(/NODE_ANTIBOT_TURNSTILE_SECRET/);
    });

    it('accepts a fully configured provider', () => {
        configure();
        process.env.NODE_ANTIBOT_PROVIDER = 'altcha';
        process.env.NODE_ANTIBOT_ALTCHA_SECRET = 'an-altcha-signing-secret-value';

        expect(assertApp).not.toThrow();
    });
});

describe('the antibot email-policy group', () => {
    it('asks for nothing while the policy is off — the default', () => {
        configure();

        expect(assertApp).not.toThrow();
    });

    it.each(['disposable', 'mx'])('accepts a recognized policy (%s)', (policy) => {
        configure();
        process.env.NODE_ANTIBOT_EMAIL_POLICY = policy;

        expect(assertApp).not.toThrow();
    });

    it('refuses to boot on an unrecognized policy, rather than throwing at the first signup', () => {
        configure();
        process.env.NODE_ANTIBOT_EMAIL_POLICY = 'not-a-policy';

        expect(assertApp).toThrow(/NODE_ANTIBOT_EMAIL_POLICY/);
    });
});
