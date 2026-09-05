/**
 * `assertRequiredConfig` — the boot gate that turns a misconfigured deployment into a refusal
 * instead of a runtime surprise.
 *
 * Every case here sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing at all.
 */
import { assertRequiredConfig } from '@kernel/required-config';
import type { AppModule } from '@kernel/registry';

/** The variables the gate reads, restored after each case so ordering cannot matter. */
const TOUCHED = [
    'NODE_ENV',
    'NODE_DEMO',
    'NODE_URL',
    'NODE_CORS_ORIGIN',
    'NODE_SMTP_HOST',
    'NODE_SMTP_USER',
    'NODE_SMTP_PASS',
    'NODE_SMTP_SENDER',
    'SECRET'
] as const;

const original = new Map(TOUCHED.map((key) => [key, process.env[key]]));

/** A deployment that satisfies every unconditional check, for a case to break one thing in. */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
    process.env.NODE_URL = 'https://api.example.com/';
    delete process.env.NODE_DEMO;
    delete process.env.NODE_SMTP_HOST;
};

afterEach(() => {
    for (const [key, value] of original)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
});

describe('module-declared variables', () => {
    it('names a variable still set to its shipped placeholder', () => {
        configure();
        process.env.SECRET = 'change-me';
        const modules: AppModule[] = [
            {
                name: 'demo',
                requiredConfig: [{ key: 'SECRET', minLength: 1, placeholder: 'change-me' }]
            }
        ];

        expect(() => assertRequiredConfig(modules)).toThrow(/SECRET/);
    });

    it('names every offender at once, not just the first', () => {
        // The whole point of collecting before throwing: N mistakes must cost one restart, not N.
        configure();
        delete process.env.NODE_URL;
        process.env.SECRET = '';
        const modules: AppModule[] = [
            { name: 'demo', requiredConfig: [{ key: 'SECRET', minLength: 8, placeholder: 'x' }] }
        ];

        expect(() => assertRequiredConfig(modules)).toThrow(/SECRET.*NODE_URL|NODE_URL.*SECRET/);
    });
});

describe('application-wide variables', () => {
    it('refuses to boot with no NODE_URL', () => {
        configure();
        delete process.env.NODE_URL;

        expect(() => assertRequiredConfig([])).toThrow(/NODE_URL/);
    });

    it('ignores an unset NODE_CORS_ORIGIN outside production', () => {
        // `productionOnly`: the localhost fallback in `app/security.ts` is right for a developer
        // and certainly wrong for a deployment, so only the deployment is asked about it.
        configure();
        delete process.env.NODE_CORS_ORIGIN;

        expect(() => assertRequiredConfig([])).not.toThrow();
    });

    it('refuses to boot in production with no NODE_CORS_ORIGIN', () => {
        configure();
        process.env.NODE_ENV = 'production';
        delete process.env.NODE_CORS_ORIGIN;

        expect(() => assertRequiredConfig([])).toThrow(/NODE_CORS_ORIGIN/);
    });
});

describe('the SMTP group', () => {
    it('accepts mail left entirely unconfigured', () => {
        // Unconfigured is a supported choice — the email second factor reports itself unavailable.
        configure();

        expect(() => assertRequiredConfig([])).not.toThrow();
    });

    it('refuses a host configured without its credentials', () => {
        configure();
        process.env.NODE_SMTP_HOST = 'mail.example.com';
        delete process.env.NODE_SMTP_USER;
        delete process.env.NODE_SMTP_PASS;
        delete process.env.NODE_SMTP_SENDER;

        expect(() => assertRequiredConfig([])).toThrow(
            /NODE_SMTP_USER, NODE_SMTP_PASS, NODE_SMTP_SENDER/
        );
    });

    it('accepts a fully configured host', () => {
        configure();
        process.env.NODE_SMTP_HOST = 'mail.example.com';
        process.env.NODE_SMTP_USER = 'noreply@example.com';
        process.env.NODE_SMTP_PASS = 'secret';
        process.env.NODE_SMTP_SENDER = 'Example <noreply@example.com>';

        expect(() => assertRequiredConfig([])).not.toThrow();
    });
});

describe('the environments that skip the gate', () => {
    it('passes under NODE_ENV=test even with everything unset', () => {
        process.env.NODE_ENV = 'test';
        delete process.env.NODE_URL;

        expect(() => assertRequiredConfig([])).not.toThrow();
    });

    it('passes in the demo profile, which boots off a copied .env-example', () => {
        process.env.NODE_ENV = 'development';
        process.env.NODE_DEMO = 'true';
        delete process.env.NODE_URL;

        expect(() => assertRequiredConfig([])).not.toThrow();
    });
});
