/**
 * `assertModuleConfig` — the boot gate that turns a misconfigured deployment into a refusal
 * instead of a runtime surprise.
 *
 * Every presence case sets `NODE_ENV` away from `test` first: presence, forbidden and cross-field
 * rules short-circuit under the test environment, so a suite that left it alone would assert
 * nothing at all. The wording and grouping of the message is `assertConfigIn`'s, covered in
 * `tests/unit/infrastructure/config/define.test.ts`; this file covers the COLLECTING — what a
 * module and the app tier each contribute, and that one refusal names all of it.
 *
 * What belongs to no module (`NODE_URL`, SMTP, the provider selectors) is asserted against
 * `APP_CONFIG_SLICES` in `tests/unit/app/config.test.ts`, since the kernel must never name a
 * module or an adapter: it owns collecting and reporting, the app tier owns what its own
 * variables are.
 */
import { assertModuleConfig, configSlicesOf } from '@kernel/module-config';
import { defineConfig } from '@infrastructure/config/define';
import { secret, text } from '@infrastructure/config/fields';
import { withoutEnvironmentInThisFile } from '@tests/environment';
import type { AppModule } from '@kernel/registry';
import type { RateLimitBudget } from '@types';

withoutEnvironmentInThisFile(['NODE_ENV', 'SECRET', 'SECRET_TWO', 'CALLER_OWNED', 'BUDGET_MAX']);

/** A deployment away from the test short-circuit, for a case to break one thing in. */
const configure = (): void => {
    process.env.NODE_ENV = 'development';
};

/**
 * A module reading one variable under the given presence rule.
 *
 * @param name - the module and slice name
 * @param variable - the variable it requires
 * @param minLength - shortest acceptable value
 */
const moduleRequiring = (name: string, variable: string, minLength: number): AppModule => ({
    name,
    config: [
        defineConfig({
            name,
            shape: { [variable]: secret({ minLength, placeholder: 'change-me' }) }
        }).slice
    ],
    personalData: 'none'
});

describe('module-declared slices', () => {
    it('names a variable still set to its shipped placeholder', () => {
        configure();
        process.env.SECRET = 'change-me';

        expect(() => assertModuleConfig([moduleRequiring('demo', 'SECRET', 1)], [])).toThrow(
            /SECRET/
        );
    });

    it('names every offender at once, not just the first', () => {
        // The whole point of collecting before throwing: N mistakes must cost one restart, not N.
        configure();
        process.env.SECRET = '';

        expect(() =>
            assertModuleConfig(
                [
                    moduleRequiring('demo', 'SECRET', 8),
                    moduleRequiring('demo-two', 'SECRET_TWO', 1)
                ],
                []
            )
        ).toThrow(/SECRET.*SECRET_TWO/);
    });

    it('checks a comma-separated ring member-by-member, not the joined string', () => {
        // account/session's key ring is exactly this shape: an ordered, comma-separated list of
        // secrets. A second entry left as the placeholder must refuse to boot even though the
        // JOINED value is long and does not itself equal the placeholder.
        configure();
        process.env.SECRET = 'a-real-secret-value,change-me';

        expect(() => assertModuleConfig([moduleRequiring('demo', 'SECRET', 16)], [])).toThrow(
            /SECRET/
        );
    });

    it('accepts a ring whose every member individually clears minLength and placeholder', () => {
        configure();
        process.env.SECRET = 'a-real-secret-value,another-real-secret-value';

        expect(() => assertModuleConfig([moduleRequiring('demo', 'SECRET', 16)], [])).not.toThrow();
    });

    it('reads a trailing comma as a typo, not as an empty member', () => {
        configure();
        process.env.SECRET = 'a-real-secret-value,';

        expect(() => assertModuleConfig([moduleRequiring('demo', 'SECRET', 16)], [])).not.toThrow();
    });

    it('still refuses a value that is nothing but commas', () => {
        configure();
        process.env.SECRET = ',,';

        expect(() => assertModuleConfig([moduleRequiring('demo', 'SECRET', 16)], [])).toThrow(
            /SECRET/
        );
    });

    it('a minLength-0 variable may stay unset, but not be the placeholder', () => {
        configure();
        delete process.env.SECRET;
        expect(() => assertModuleConfig([moduleRequiring('demo', 'SECRET', 0)], [])).not.toThrow();

        process.env.SECRET = 'change-me';
        expect(() => assertModuleConfig([moduleRequiring('demo', 'SECRET', 0)], [])).toThrow(
            /SECRET/
        );
    });
});

describe('the environment that skips the presence rules', () => {
    it('passes under NODE_ENV=test even with everything unset', () => {
        process.env.NODE_ENV = 'test';

        expect(() => assertModuleConfig([moduleRequiring('demo', 'SECRET', 16)], [])).not.toThrow();
    });
});

describe('forbiddenOutsideRelaxed — forbidden, not required', () => {
    // `SECRET` stands in for a module's own forbidden variable here — the mechanism under test is
    // generic; `src/modules/webhooks/tests/unit/module.test.ts` covers the real
    // NODE_WEBHOOK_DEMO_SINK_URL case against this module's actual slice.
    const modules: AppModule[] = [
        {
            name: 'demo',
            config: [
                defineConfig({
                    name: 'demo',
                    shape: { SECRET: text({ forbiddenOutsideRelaxed: true }) }
                }).slice
            ],
            personalData: 'none'
        }
    ];

    it('accepts it set outside production', () => {
        configure();
        process.env.SECRET = 'a-real-secret-value';

        expect(() => assertModuleConfig(modules, [])).not.toThrow();
    });

    it('refuses to boot in production with it set', () => {
        process.env.NODE_ENV = 'production';
        process.env.SECRET = 'a-real-secret-value';

        expect(() => assertModuleConfig(modules, [])).toThrow(/SECRET/);
    });

    it('refuses to boot with NODE_ENV unset and it set: only development/test relax the rule', () => {
        delete process.env.NODE_ENV;
        process.env.SECRET = 'a-real-secret-value';

        expect(() => assertModuleConfig(modules, [])).toThrow(/SECRET/);
    });

    it('accepts production with it unset', () => {
        process.env.NODE_ENV = 'production';

        expect(() => assertModuleConfig(modules, [])).not.toThrow();
    });
});

/**
 * A module whose only slice fails its check with one message.
 *
 * @param name - the module and slice name
 * @param message - the problem its check reports
 */
const failing = (name: string, message: string): AppModule => ({
    name,
    config: [defineConfig({ name, shape: {}, check: () => [message] }).slice],
    personalData: 'none'
});

describe('appSlices — what a caller other than a module contributes', () => {
    it('folds a caller-declared slice into the same refusal as a module’s', () => {
        configure();
        delete process.env.CALLER_OWNED;
        const callerSlice = defineConfig({
            name: 'caller',
            shape: { CALLER_OWNED: text({ required: { minLength: 1 } }) }
        }).slice;

        expect(() =>
            assertModuleConfig([moduleRequiring('demo', 'SECRET', 8)], [callerSlice])
        ).toThrow(/SECRET.*CALLER_OWNED|CALLER_OWNED.*SECRET/);
    });

    it('runs a slice check alongside every module’s own', () => {
        configure();

        expect(() =>
            assertModuleConfig(
                [failing('demo', 'FROM_MODULE')],
                [failing('caller', 'FROM_CALLER').config![0]]
            )
        ).toThrow(/FROM_CALLER.*FROM_MODULE|FROM_MODULE.*FROM_CALLER/);
    });
});

describe('a module’s rate-limit budgets', () => {
    /** A budget whose ceiling is `BUDGET_MAX`. */
    const budget: RateLimitBudget = {
        name: 'Demo',
        namespace: 'demo',
        environmentVariable: 'BUDGET_MAX',
        defaultMax: 5,
        windowMs: 'shared',
        keyedBy: 'address',
        bounds: 'a demo',
        audited: false
    };
    const appModule: AppModule = { name: 'demo', rateLimits: [budget], personalData: 'none' };

    it('become a slice, so a module that declares one has its ceiling checked with the rest', () => {
        expect(configSlicesOf(appModule).map((slice) => slice.name)).toEqual(['demo-rate-limits']);
    });

    it('refuses a ceiling that is not a whole number, even under NODE_ENV=test', () => {
        process.env.NODE_ENV = 'test';
        process.env.BUDGET_MAX = '20/min';

        expect(() => assertModuleConfig([appModule], [])).toThrow(/BUDGET_MAX/);
    });

    it('contributes nothing for a module with no budgets', () => {
        expect(configSlicesOf({ name: 'plain', personalData: 'none' })).toEqual([]);
    });
});
