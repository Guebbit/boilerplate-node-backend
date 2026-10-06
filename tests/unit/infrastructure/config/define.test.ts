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
import { resetEnvironment, setEnvironment, setProcessEnvironment } from '@tests/environment';

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
        NODE_SAMPLE_HOST: text({ required: { minLength: 1 } })
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
    afterEach(() => {
        resetEnvironment();
    });

    it('returns typed values with defaults filled in', () => {
        expect(slice()).toMatchObject({ NODE_SAMPLE_LIMIT: 10, NODE_SAMPLE_ON: true });
    });

    it('sees an override on the next call', () => {
        setEnvironment({ NODE_SAMPLE_LIMIT: '25' });

        expect(slice().NODE_SAMPLE_LIMIT).toBe(25);
    });

    it('does not see a later write to process.env: the environment is read once', () => {
        slice();

        setProcessEnvironment({ NODE_SAMPLE_LIMIT: '99' });

        expect(slice().NODE_SAMPLE_LIMIT).toBe(10);
    });

    it('returns the same object while nothing changed', () => {
        expect(slice()).toBe(slice());
    });

    it('is frozen', () => {
        expect(Object.isFrozen(slice())).toBe(true);
    });

    it('throws a ConfigError naming the variable when a value is refused', () => {
        setEnvironment({ NODE_SAMPLE_LIMIT: '5mb' });

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
        setEnvironment({ NODE_SAMPLE_SECRET_NUMBER: 'hunter2' });

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
            NODE_SAMPLE_KEY: 'your-key-here'
        };

        expect(() => assertConfigIn([slice.slice], env)).toThrow(
            /^Refusing to boot: invalid values — NODE_SAMPLE_LIMIT: expected whole number >= 1 \(got "lots"\); missing, too short, or still set to their \.env-example placeholder — NODE_SAMPLE_KEY, NODE_SAMPLE_HOST$/
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

    describe('a key that must decode to enough bytes', () => {
        const keyed = defineConfig({
            name: 'keyed',
            shape: { NODE_SAMPLE_KEY: secret({ minLength: 1, minBytes: 32 }) }
        });
        const refuses = (value: string): void =>
            expect(() =>
                assertConfigIn([keyed.slice], { NODE_ENV: 'production', NODE_SAMPLE_KEY: value })
            ).toThrow(/NODE_SAMPLE_KEY/);
        const accepts = (value: string): void =>
            expect(() =>
                assertConfigIn([keyed.slice], { NODE_ENV: 'production', NODE_SAMPLE_KEY: value })
            ).not.toThrow();

        it('accepts 32 bytes of hex, base64 and base64url, and a ring entry with a version prefix', () => {
            accepts('ab'.repeat(32));
            accepts(Buffer.alloc(32, 7).toString('base64'));
            accepts(Buffer.alloc(33, 255).toString('base64url'));
            accepts(`v2:${'cd'.repeat(32)},v1:${'ef'.repeat(32)}`);
        });

        it('refuses a value that is long enough in characters but short in bytes', () => {
            // 40 hex characters are only 20 bytes; as base64 they would overcount to 30.
            refuses('ab'.repeat(20));
            refuses(Buffer.alloc(31, 1).toString('base64'));
        });

        it('refuses a value that is neither hex nor base64, however long', () => {
            // `Buffer.from(x, "base64")` skips bad characters, so this would "decode" long enough.
            refuses('this is a long passphrase, with spaces and punctuation!!');
            refuses('placeholder-with-a-dot.and.more.characters.beyond.32');
        });

        it('judges every member of a ring, so one weak entry anywhere refuses', () => {
            refuses(`${'ab'.repeat(32)},short`);
        });
    });

    it('reports fields for the generated page in declaration order', () => {
        expect(slice.slice.fields.map(({ name }) => name)).toEqual([
            'NODE_SAMPLE_LIMIT',
            'NODE_SAMPLE_ON',
            'NODE_SAMPLE_KEY',
            'NODE_SAMPLE_HOST'
        ]);
    });
});
