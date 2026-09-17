/**
 * This module's own boot gate: `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` (required) and
 * `NODE_WEBHOOK_DEMO_SINK_URL` (forbidden in production) — both declared on the manifest, both
 * driven through `assertRequiredConfig` rather than by asserting on the manifest's data directly,
 * the same reasoning `products/tests/unit/config.test.ts` gives: the manifest wiring is half of
 * what makes either check run at all.
 *
 * `tests/unit/kernel/required-config.test.ts` covers the generic `forbiddenInProduction`
 * mechanism against a fake module; this file is the one real case.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertRequiredConfig } from '@kernel/required-config';
import { withoutEnvironmentInThisFile } from '@tests/environment';
import webhooksModule from '../../module';

/** Every variable this gate reads, cleared before each case and put back after the file. */
const TOUCHED = [
    'NODE_ENV',
    'NODE_URL',
    'NODE_CORS_ORIGIN',
    'NODE_WEBHOOK_SECRET_ENCRYPTION_KEY',
    'NODE_WEBHOOK_DEMO_SINK_URL',
    'NODE_SMTP_HOST',
    'NODE_ANTIBOT_PROVIDER',
    'NODE_ANTIBOT_EMAIL_POLICY'
] as const;

withoutEnvironmentInThisFile(TOUCHED);

/** A deployment that satisfies every check, for a case to break one thing in. */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
    process.env.NODE_URL = 'https://api.example.com/';
    process.env.NODE_WEBHOOK_SECRET_ENCRYPTION_KEY = 'a-real-32-byte-webhook-secret-key!!';
};

describe('the secret-ring encryption key', () => {
    it('refuses to boot with it unset', () => {
        configure();
        delete process.env.NODE_WEBHOOK_SECRET_ENCRYPTION_KEY;

        expect(() => assertRequiredConfig([webhooksModule])).toThrow(
            /NODE_WEBHOOK_SECRET_ENCRYPTION_KEY/
        );
    });

    it('refuses to boot still set to the shipped placeholder', () => {
        configure();
        process.env.NODE_WEBHOOK_SECRET_ENCRYPTION_KEY = 'your-webhook-secret-encryption-key-here';

        expect(() => assertRequiredConfig([webhooksModule])).toThrow(
            /NODE_WEBHOOK_SECRET_ENCRYPTION_KEY/
        );
    });

    it('accepts a real key', () => {
        configure();

        expect(() => assertRequiredConfig([webhooksModule])).not.toThrow();
    });
});

describe('the demo-sink exemption', () => {
    it('accepts it set outside production', () => {
        configure();
        process.env.NODE_WEBHOOK_DEMO_SINK_URL = 'http://webhook-tester:8080';

        expect(() => assertRequiredConfig([webhooksModule])).not.toThrow();
    });

    it('refuses to boot in production with it set', () => {
        configure();
        process.env.NODE_ENV = 'production';
        process.env.NODE_CORS_ORIGIN = 'https://example.com';
        process.env.NODE_WEBHOOK_DEMO_SINK_URL = 'http://webhook-tester:8080';

        expect(() => assertRequiredConfig([webhooksModule])).toThrow(/NODE_WEBHOOK_DEMO_SINK_URL/);
    });

    it('accepts production with it unset', () => {
        configure();
        process.env.NODE_ENV = 'production';
        process.env.NODE_CORS_ORIGIN = 'https://example.com';

        expect(() => assertRequiredConfig([webhooksModule])).not.toThrow();
    });
});
