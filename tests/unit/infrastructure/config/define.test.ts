/**
 * `src/infrastructure/config/define.ts` — a slice, its accessor, and the boot gate.
 *
 * The gate's contract is the subject: every mistake in one message, shape rules everywhere,
 * presence rules only where a developer machine is not the excuse, and no credential ever echoed.
 */
import {
    ConfigError,
    assertConfigIn,
    defineConfig,
    isRelaxedIn
} from '@infrastructure/config/define';
import { flag, int, secret, text } from '@infrastructure/config/fields';

/** A slice covering one field of each rule kind. */
const slice = defineConfig({
    name: 'sample',
    shape: {
        NODE_SAMPLE_LIMIT: int({ default: 10, min: 1 }),
        NODE_SAMPLE_ON: flag({ default: true }),
        NODE_SAMPLE_KEY: secret({
            minLength: 8,
            placeholder: 'your-key-here',
            productionOnly: true
        }),
        NODE_SAMPLE_HOST: text({ required: { minLength: 1 } }),
        NODE_SAMPLE_DEMO_SINK: text({ forbiddenOutsideRelaxed: true })
    },
    check: (config) =>
        config.NODE_SAMPLE_ON && config.NODE_SAMPLE_LIMIT > 100
            ? ['limit is too high while on']
            : []
});

/** A production-shaped environment that satisfies the slice. */
const GOOD = {
    NODE_ENV: 'production',
    NODE_SAMPLE_KEY: 'a-long-enough-key',
    NODE_SAMPLE_HOST: 'localhost'
};

describe('isRelaxedIn', () => {
    it.each([
        ['development', true],
        ['test', true],
        ['production', false],
        ['staging', false],
        [undefined, false]
    ])('%s -> %s', (nodeEnv, expected) => {
        expect(isRelaxedIn({ NODE_ENV: nodeEnv })).toBe(expected);
    });
});

describe('the accessor', () => {
    const original = { ...process.env };

    afterEach(() => {
        for (const key of Object.keys(process.env))
            if (key.startsWith('NODE_SAMPLE_')) delete process.env[key];
        Object.assign(process.env, original);
    });

    it('returns typed values with defaults filled in', () => {
        expect(slice()).toMatchObject({ NODE_SAMPLE_LIMIT: 10, NODE_SAMPLE_ON: true });
    });

    it('sees a changed variable on the next call', () => {
        process.env.NODE_SAMPLE_LIMIT = '25';

        expect(slice().NODE_SAMPLE_LIMIT).toBe(25);
    });

    it('returns the same object while nothing changed', () => {
        expect(slice()).toBe(slice());
    });

    it('is frozen', () => {
        expect(Object.isFrozen(slice())).toBe(true);
    });

    it('throws a ConfigError naming the variable when a value is refused', () => {
        process.env.NODE_SAMPLE_LIMIT = '5mb';

        expect(() => slice()).toThrow(ConfigError);
        expect(() => slice()).toThrow(
            /sample.*NODE_SAMPLE_LIMIT: expected whole number >= 1 \(got "5mb"\)/
        );
    });

    it('never echoes a credential', () => {
        const secretSlice = defineConfig({
            name: 'secrets',
            shape: { NODE_SAMPLE_SECRET_NUMBER: { ...int(), sensitive: true } }
        });
        process.env.NODE_SAMPLE_SECRET_NUMBER = 'hunter2';

        expect(() => secretSlice()).toThrow(/expected whole number/);
        expect(() => secretSlice()).not.toThrow(/hunter2/);
    });
});

describe('assertConfigIn', () => {
    it('passes a good deployment', () => {
        expect(() => assertConfigIn([slice.slice], GOOD)).not.toThrow();
    });

    it('lists every mistake at once, grouped by kind', () => {
        const env = {
            NODE_ENV: 'production',
            NODE_SAMPLE_LIMIT: 'lots',
            NODE_SAMPLE_KEY: 'your-key-here',
            NODE_SAMPLE_DEMO_SINK: 'http://sink'
        };

        expect(() => assertConfigIn([slice.slice], env)).toThrow(
            /^Refusing to boot: invalid values — NODE_SAMPLE_LIMIT: expected whole number >= 1 \(got "lots"\); missing, too short, or still set to their \.env-example placeholder — NODE_SAMPLE_KEY, NODE_SAMPLE_HOST; set, which must never happen here — NODE_SAMPLE_DEMO_SINK$/
        );
    });

    it('runs the slice check on the parsed values', () => {
        expect(() => assertConfigIn([slice.slice], { ...GOOD, NODE_SAMPLE_LIMIT: '500' })).toThrow(
            /failing their own configuration check — limit is too high while on/
        );
    });

    it('skips the slice check when a value is already invalid', () => {
        expect(() =>
            assertConfigIn([slice.slice], { ...GOOD, NODE_SAMPLE_LIMIT: 'x' })
        ).not.toThrow(/own configuration check/);
    });

    it('applies a production-only rule only outside development and test', () => {
        const env = { NODE_SAMPLE_HOST: 'localhost' };

        expect(() =>
            assertConfigIn([slice.slice], { ...env, NODE_ENV: 'development' })
        ).not.toThrow();
        expect(() => assertConfigIn([slice.slice], { ...env, NODE_ENV: 'staging' })).toThrow(
            /NODE_SAMPLE_KEY/
        );
        expect(() => assertConfigIn([slice.slice], env)).toThrow(/NODE_SAMPLE_KEY/);
    });

    it('applies a plain presence rule in development, but not in test', () => {
        expect(() => assertConfigIn([slice.slice], { NODE_ENV: 'development' })).toThrow(
            /NODE_SAMPLE_HOST/
        );
        expect(() => assertConfigIn([slice.slice], { NODE_ENV: 'test' })).not.toThrow();
    });

    it('still refuses a wrongly-shaped value under test', () => {
        expect(() =>
            assertConfigIn([slice.slice], { NODE_ENV: 'test', NODE_SAMPLE_LIMIT: '5mb' })
        ).toThrow(/NODE_SAMPLE_LIMIT/);
    });

    it('checks a key ring member by member', () => {
        const ring = defineConfig({
            name: 'ring',
            shape: { NODE_SAMPLE_RING: secret({ minLength: 4, placeholder: 'change-me' }) }
        });

        expect(() =>
            assertConfigIn([ring.slice], {
                NODE_ENV: 'production',
                NODE_SAMPLE_RING: 'good-one,change-me'
            })
        ).toThrow(/NODE_SAMPLE_RING/);
    });

    it('reports fields for the generated page in declaration order', () => {
        expect(slice.slice.fields.map(({ name }) => name)).toEqual([
            'NODE_SAMPLE_LIMIT',
            'NODE_SAMPLE_ON',
            'NODE_SAMPLE_KEY',
            'NODE_SAMPLE_HOST',
            'NODE_SAMPLE_DEMO_SINK'
        ]);
    });
});
