/**
 * `APP_NON_MODULE_CHECKS` — the app tier's own boot-time entries, folded into
 * `assertRequiredConfig` (`@kernel/required-config`) by `src/app.ts`. The gate's own mechanism —
 * collecting, reporting once, skipping under test/demo — is covered in
 * `tests/unit/kernel/required-config.test.ts`; this file only asserts what THESE entries are.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing at all.
 */
import { assertRequiredConfig } from '@kernel/required-config';
import { APP_NON_MODULE_CHECKS } from '@app/required-config';
import { enableDemoProfile } from '@infrastructure/runtime/demo-profile';
import { resetAnalyticsProvider } from '@infrastructure/observability/analytics';
import { withoutEnvironmentInThisFile } from '@tests/environment';

withoutEnvironmentInThisFile([
    'NODE_ENV',
    'NODE_URL',
    'NODE_CORS_ORIGIN',
    'NODE_SMTP_HOST',
    'NODE_SMTP_USER',
    'NODE_SMTP_PASS',
    'NODE_SMTP_SENDER',
    'NODE_ANALYTICS_PROVIDER',
    'NODE_MAIL_TRANSPORT',
    'NODE_LOG_PERSONAL_FIELDS'
]);

/**
 * A deployment that satisfies every unconditional check — every other variable this file touches
 * is already cleared by `withoutEnvironmentInThisFile`'s own `beforeEach`.
 */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
    process.env.NODE_URL = 'https://api.example.com/';
};

/** `assertRequiredConfig` wired the way `src/app.ts` wires it — the whole point of this file. */
const assertApp = (): void => assertRequiredConfig([], APP_NON_MODULE_CHECKS);

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
});
