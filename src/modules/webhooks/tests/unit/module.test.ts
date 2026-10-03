/**
 * This module's own boot gate: `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` (required) and
 * `NODE_WEBHOOK_DEMO_SINK_URL` (forbidden in production) — both declared on the manifest, both
 * driven through `assertModuleConfig` rather than by asserting on the manifest's data directly,
 * the same reasoning `products/tests/unit/config.test.ts` gives: the manifest wiring is half of
 * what makes either check run at all.
 *
 * `tests/unit/kernel/module-config.test.ts` covers the generic `forbiddenOutsideRelaxed`
 * mechanism against a fake module; this file is the one real case.
 *
 * Every case sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing.
 */
import { assertModuleConfig } from '@kernel/module-config';
import { withoutEnvironmentInThisFile, setEnvironment } from '@tests/environment';
import { logger } from '@infrastructure/adapters/logger';
import webhooksModule from '../../module';

/** Every variable this gate reads, cleared before each case and put back after the file. */
const TOUCHED = [
    'NODE_ENV',
    'NODE_URL',
    'NODE_CORS_ORIGIN',
    'NODE_WEBHOOK_SECRET_ENCRYPTION_KEY',
    'NODE_WEBHOOK_DEMO_SINK_URL',
    'NODE_RABBITMQ_URL',
    'NODE_RABBITMQ_PORT'
] as const;

withoutEnvironmentInThisFile(TOUCHED);

/** A deployment that satisfies every check, for a case to break one thing in. */
const configure = (): void => {
    setEnvironment({ NODE_ENV: 'development' });
    setEnvironment({ NODE_URL: 'https://api.example.com/' });
    setEnvironment({ NODE_WEBHOOK_SECRET_ENCRYPTION_KEY: 'a-real-32-byte-webhook-secret-key!!' });
};

describe('the secret-ring encryption key', () => {
    it('refuses to boot with it unset', () => {
        configure();
        setEnvironment({ NODE_WEBHOOK_SECRET_ENCRYPTION_KEY: undefined });

        expect(() => assertModuleConfig([webhooksModule], [])).toThrow(
            /NODE_WEBHOOK_SECRET_ENCRYPTION_KEY/
        );
    });

    it('refuses to boot still set to the shipped placeholder', () => {
        configure();
        setEnvironment({
            NODE_WEBHOOK_SECRET_ENCRYPTION_KEY: 'your-webhook-secret-encryption-key-here'
        });

        expect(() => assertModuleConfig([webhooksModule], [])).toThrow(
            /NODE_WEBHOOK_SECRET_ENCRYPTION_KEY/
        );
    });

    it('accepts a real key', () => {
        configure();

        expect(() => assertModuleConfig([webhooksModule], [])).not.toThrow();
    });
});

describe('the demo-sink exemption', () => {
    it('accepts it set outside production', () => {
        configure();
        setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: 'https://webhook-tester-tls:8443' });

        expect(() => assertModuleConfig([webhooksModule], [])).not.toThrow();
    });

    it('refuses to boot in production with it set', () => {
        configure();
        setEnvironment({ NODE_ENV: 'production' });
        setEnvironment({ NODE_CORS_ORIGIN: 'https://example.com' });
        setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: 'https://webhook-tester-tls:8443' });

        expect(() => assertModuleConfig([webhooksModule], [])).toThrow(
            /NODE_WEBHOOK_DEMO_SINK_URL/
        );
    });

    it('refuses to boot with NODE_ENV unset and it set, since only development/test may use it', () => {
        configure();
        setEnvironment({ NODE_ENV: undefined });
        setEnvironment({ NODE_CORS_ORIGIN: 'https://example.com' });
        setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: 'https://webhook-tester-tls:8443' });

        expect(() => assertModuleConfig([webhooksModule], [])).toThrow(
            /NODE_WEBHOOK_DEMO_SINK_URL/
        );
    });

    it('accepts production with it unset', () => {
        configure();
        setEnvironment({ NODE_ENV: 'production' });
        setEnvironment({ NODE_CORS_ORIGIN: 'https://example.com' });

        expect(() => assertModuleConfig([webhooksModule], [])).not.toThrow();
    });
});

describe('the boot warning', () => {
    it('says deliveries wait for the sweep when no broker is configured', () => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
        setEnvironment({ NODE_RABBITMQ_URL: undefined });
        setEnvironment({ NODE_RABBITMQ_PORT: undefined });

        webhooksModule.onRegistered([]);

        expect(warn).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('no message broker') })
        );
        warn.mockRestore();
    });

    it('stays quiet when a broker is configured', () => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
        setEnvironment({ NODE_RABBITMQ_URL: 'amqp://broker.example.com' });

        webhooksModule.onRegistered([]);

        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
