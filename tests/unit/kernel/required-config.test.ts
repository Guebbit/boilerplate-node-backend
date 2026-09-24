/**
 * `assertRequiredConfig` — the boot gate that turns a misconfigured deployment into a refusal
 * instead of a runtime surprise.
 *
 * Every case here sets `NODE_ENV` away from `test` first: the gate short-circuits under the test
 * environment, so a suite that left it alone would assert nothing at all.
 *
 * This file covers the MECHANISM only — what belongs to no module but is not the kernel's own
 * either (`NODE_URL`, SMTP, the provider selectors) is asserted against `APP_NON_MODULE_CHECKS`
 * in `tests/unit/app/required-config.test.ts`, since the kernel must never name a module or an
 * adapter: it owns collecting and reporting, the app tier owns what its own variables are.
 * Antibot's own checks live on its own manifest — see
 * `src/modules/antibot/tests/unit/module.test.ts`.
 */
import { assertRequiredConfig, checkSelector } from '@kernel/required-config';
import { enableDemoProfile } from '@infrastructure/runtime/demo-profile';
import { withoutEnvironmentInThisFile } from '@tests/environment';
import type { AppModule } from '@kernel/registry';

withoutEnvironmentInThisFile(['NODE_ENV', 'SECRET']);

/** A deployment away from the test/demo short-circuit, for a case to break one thing in. */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
};

afterEach(() => enableDemoProfile(false));

/** One module requiring `SECRET`, at least 16 characters, not the shipped placeholder. */
const SECRET_MODULE: AppModule[] = [
    {
        name: 'demo',
        requiredConfig: [{ key: 'SECRET', minLength: 16, placeholder: 'change-me' }],
        personalData: 'none'
    }
];

describe('module-declared variables', () => {
    it('names a variable still set to its shipped placeholder', () => {
        configure();
        process.env.SECRET = 'change-me';
        const modules: AppModule[] = [
            {
                name: 'demo',
                requiredConfig: [{ key: 'SECRET', minLength: 1, placeholder: 'change-me' }],
                personalData: 'none'
            }
        ];

        expect(() => assertRequiredConfig(modules)).toThrow(/SECRET/);
    });

    it('names every offender at once, not just the first', () => {
        // The whole point of collecting before throwing: N mistakes must cost one restart, not N.
        configure();
        process.env.SECRET = '';
        const modules: AppModule[] = [
            {
                name: 'demo',
                requiredConfig: [{ key: 'SECRET', minLength: 8, placeholder: 'x' }],
                personalData: 'none'
            },
            {
                name: 'demo-two',
                requiredConfig: [{ key: 'SECRET_TWO', minLength: 1 }],
                personalData: 'none'
            }
        ];

        expect(() => assertRequiredConfig(modules)).toThrow(
            /SECRET.*SECRET_TWO|SECRET_TWO.*SECRET/
        );
    });

    it('checks a comma-separated ring member-by-member, not the joined string', () => {
        // account/session's key ring is exactly this shape: an ordered, comma-separated list of
        // secrets. A second entry left as the placeholder must refuse to boot even though the
        // JOINED value is long and does not itself equal the placeholder.
        configure();
        process.env.SECRET = 'a-real-secret-value,change-me';
        const modules: AppModule[] = [
            {
                name: 'demo',
                requiredConfig: [{ key: 'SECRET', minLength: 16, placeholder: 'change-me' }],
                personalData: 'none'
            }
        ];

        expect(() => assertRequiredConfig(modules)).toThrow(/SECRET/);
    });

    it('accepts a ring whose every member individually clears minLength and placeholder', () => {
        configure();
        process.env.SECRET = 'a-real-secret-value,another-real-secret-value';
        const modules: AppModule[] = [
            {
                name: 'demo',
                requiredConfig: [{ key: 'SECRET', minLength: 16, placeholder: 'change-me' }],
                personalData: 'none'
            }
        ];

        expect(() => assertRequiredConfig(modules)).not.toThrow();
    });

    it('reads a trailing comma as a typo, not as an empty member', () => {
        configure();
        process.env.SECRET = 'a-real-secret-value,';

        expect(() => assertRequiredConfig(SECRET_MODULE)).not.toThrow();
    });

    it('still refuses a value that is nothing but commas', () => {
        configure();
        process.env.SECRET = ',,';

        expect(() => assertRequiredConfig(SECRET_MODULE)).toThrow(/SECRET/);
    });
});

describe('the environments that skip the gate', () => {
    it('passes under NODE_ENV=test even with everything unset', () => {
        process.env.NODE_ENV = 'test';

        expect(() => assertRequiredConfig([])).not.toThrow();
    });

    it('passes in the demo profile, which boots off a copied .env-example', () => {
        process.env.NODE_ENV = 'development';
        enableDemoProfile();

        expect(() => assertRequiredConfig([])).not.toThrow();
    });
});

describe('module-declared forbiddenInProduction — forbidden, not required', () => {
    // `SECRET` stands in for a module's own forbidden variable here — the mechanism under test is
    // generic; `src/modules/webhooks/tests/unit/module.test.ts` covers the real
    // NODE_WEBHOOK_DEMO_SINK_URL case against this module's actual manifest entry.
    const modules: AppModule[] = [
        { name: 'demo', forbiddenInProduction: ['SECRET'], personalData: 'none' }
    ];

    it('accepts it set outside production', () => {
        configure();
        process.env.SECRET = 'a-real-secret-value';

        expect(() => assertRequiredConfig(modules)).not.toThrow();
    });

    it('refuses to boot in production with it set', () => {
        configure();
        process.env.NODE_ENV = 'production';
        process.env.SECRET = 'a-real-secret-value';

        expect(() => assertRequiredConfig(modules)).toThrow(/SECRET/);
    });

    it('accepts production with it unset', () => {
        configure();
        process.env.NODE_ENV = 'production';

        expect(() => assertRequiredConfig(modules)).not.toThrow();
    });
});

describe('checkSelector', () => {
    it('reports nothing when the resolver does not throw', () => {
        expect(checkSelector('FAKE_SELECTOR', () => 'ok')).toEqual([]);
    });

    it("keeps the resolver's own message rather than the bare key", () => {
        // The message already names the variable and its allowed values — folding it down to
        // just the key would lose exactly the detail an operator needs to fix the deployment.
        expect(
            checkSelector('FAKE_SELECTOR', () => {
                throw new Error('Unknown FAKE_SELECTOR: "bogus". Allowed: a, b.');
            })
        ).toEqual(['Unknown FAKE_SELECTOR: "bogus". Allowed: a, b.']);
    });

    it('falls back to the key if a resolver ever threw something with no message', () => {
        expect(
            checkSelector('FAKE_SELECTOR', () => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising the non-Error fallback on purpose
                throw 'not an Error';
            })
        ).toEqual(['Unknown FAKE_SELECTOR']);
    });
});

describe('nonModuleChecks — what a caller other than a module contributes', () => {
    it('is optional — omitting it entirely changes nothing', () => {
        configure();

        expect(() => assertRequiredConfig([])).not.toThrow();
    });

    it('folds a caller-declared required entry into the same refusal', () => {
        configure();
        delete process.env.CALLER_OWNED;

        expect(() =>
            assertRequiredConfig([], { required: [{ key: 'CALLER_OWNED', minLength: 1 }] })
        ).toThrow(/CALLER_OWNED/);
    });

    it('runs a caller-declared custom check alongside every module customCheck', () => {
        configure();
        const modules: AppModule[] = [
            { name: 'demo', customCheck: () => ['FROM_MODULE'], personalData: 'none' }
        ];

        expect(() =>
            assertRequiredConfig(modules, { customChecks: [() => ['FROM_CALLER']] })
        ).toThrow(/FROM_MODULE.*FROM_CALLER|FROM_CALLER.*FROM_MODULE/);
    });
});
