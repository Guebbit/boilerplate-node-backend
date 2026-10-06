/**
 * `src/infrastructure/config/fields.ts` — the builders a configuration slice is written with.
 *
 * Every builder is exercised on the inputs that were once a silent fallback: a unit suffix, a
 * misspelt switch, a value outside the set. The subject is that these are now refused, and that
 * a blank or unset value still takes the default.
 */
import {
    choice,
    csv,
    decimal,
    email,
    flag,
    int,
    keyRing,
    secret,
    text,
    versionedKeyRing
} from '@infrastructure/config/fields';

describe('int', () => {
    const field = int({ default: 30, min: 1 });

    it('reads a whole number, zero-padded included', () => {
        expect(field.schema.parse('900')).toBe(900);
        expect(field.schema.parse('0900')).toBe(900);
    });

    it('takes the default when unset or blank', () => {
        expect(field.schema.parse(undefined)).toBe(30);
        expect(field.schema.parse('   ')).toBe(30);
    });

    it.each(['5mb', '0x10', '1e3', '1.5', 'abc'])('refuses %s', (raw) => {
        expect(field.schema.safeParse(raw).success).toBe(false);
    });

    it('refuses a value below its minimum, above its maximum', () => {
        expect(field.schema.safeParse('0').success).toBe(false);
        expect(int({ max: 5 }).schema.safeParse('6').success).toBe(false);
    });

    it('has no default when none is given', () => {
        expect(int().schema.parse(undefined)).toBeUndefined();
        expect(int().doc.default).toBeUndefined();
    });

    it('describes itself for the generated page', () => {
        expect(field.doc).toEqual({ type: 'whole number >= 1', default: '30' });
    });
});

describe('decimal', () => {
    const field = decimal({ default: 0.22, min: 0, max: 1 });

    it('reads a decimal', () => {
        expect(field.schema.parse('0.1')).toBe(0.1);
        expect(field.schema.parse('1')).toBe(1);
    });

    it.each(['.5', '1e-1', 'x', '2', '-0.1'])('refuses %s', (raw) => {
        expect(field.schema.safeParse(raw).success).toBe(false);
    });

    it('takes the default when unset', () => {
        expect(field.schema.parse(undefined)).toBe(0.22);
    });
});

describe('flag', () => {
    const field = flag({ default: false });

    it.each([
        ['1', true],
        ['TRUE', true],
        [' yes ', true],
        ['on', true],
        ['0', false],
        ['False', false],
        ['no', false],
        ['off', false]
    ])('reads %s', (raw, expected) => {
        expect(field.schema.parse(raw)).toBe(expected);
    });

    it('refuses a word that is neither, instead of guessing', () => {
        expect(field.schema.safeParse('maybe').success).toBe(false);
    });

    it('takes the default when unset, and renders it as on/off', () => {
        expect(field.schema.parse(undefined)).toBe(false);
        expect(flag({ default: true }).doc.default).toBe('on');
    });
});

describe('choice', () => {
    it('trims and lower-cases', () => {
        expect(choice(['smtp', 'log'], { default: 'smtp' }).schema.parse('  LOG ')).toBe('log');
    });

    it('refuses a value outside the set, naming the set', () => {
        const result = choice(['smtp', 'log'], { default: 'smtp' }).schema.safeParse('sms');
        expect(result.success ? '' : result.error.issues[0]?.message).toBe('one of smtp, log');
    });

    it('asks a function for the set on every parse, for a registry filled after import', () => {
        const names: string[] = ['fake'];
        const field = choice(() => names, { default: 'fake' });
        expect(field.schema.safeParse('stripe').success).toBe(false);

        names.push('stripe');

        expect(field.schema.parse('stripe')).toBe('stripe');
    });

    it('takes the default when blank', () => {
        expect(choice(['a', 'b'], { default: 'b' }).schema.parse('')).toBe('b');
    });
});

describe('email', () => {
    it('reads an address, trimmed', () => {
        expect(email().schema.parse('  shop@example.com ')).toBe('shop@example.com');
    });

    it('refuses a value that is not an address, rather than reading it as unset', () => {
        expect(() => email().schema.parse('not-an-address')).toThrow(/email address/);
    });

    it('reads a blank value as unset', () => {
        expect(email().schema.parse('  ')).toBeUndefined();
    });
});

describe('text and secret', () => {
    it('trims and treats blank as unset', () => {
        expect(text().schema.parse('  hello ')).toBe('hello');
        expect(text().schema.parse('  ')).toBeUndefined();
    });

    it('normalises case when asked', () => {
        expect(text({ case: 'upper' }).schema.parse('it')).toBe('IT');
        expect(text({ case: 'lower' }).schema.parse('IT')).toBe('it');
    });

    it('marks a secret sensitive and carries its presence rule', () => {
        const field = secret({ minLength: 32, placeholder: 'change-me', productionOnly: true });

        expect(field.sensitive).toBe(true);
        expect(field.presence).toEqual({
            minLength: 32,
            placeholder: 'change-me',
            productionOnly: true
        });
    });
});

describe('setBy', () => {
    it('reaches the field document, and is absent when not given', () => {
        expect(text({ setBy: 'npm' }).doc.setBy).toBe('npm');
        expect(flag({ default: false, setBy: 'e2e:serve' }).doc.setBy).toBe('e2e:serve');
        expect(text().doc).not.toHaveProperty('setBy');
    });
});

describe('csv and key rings', () => {
    it('splits, trims and drops blank members', () => {
        expect(csv().schema.parse(' a, b ,, c,')).toEqual(['a', 'b', 'c']);
    });

    it('is the empty list when unset', () => {
        expect(csv().schema.parse(undefined)).toEqual([]);
    });

    it('takes its default when unset, and shows it on the page', () => {
        const field = csv({ default: ['a', 'b'] });
        expect(field.schema.parse(undefined)).toEqual(['a', 'b']);
        expect(field.schema.parse('c')).toEqual(['c']);
        expect(field.doc.default).toBe('a,b');
    });

    it('normalises each member when asked', () => {
        expect(csv({ case: 'upper' }).schema.parse('it, de')).toEqual(['IT', 'DE']);
    });

    it('reads a key ring newest first and marks it sensitive', () => {
        const field = keyRing();

        expect(field.schema.parse('new,old')).toEqual(['new', 'old']);
        expect(field.sensitive).toBe(true);
    });

    it('reads a versioned ring, a bare value being v1', () => {
        expect(versionedKeyRing().schema.parse('v2:new,old')).toEqual([
            { version: 'v2', key: 'new' },
            { version: 'v1', key: 'old' }
        ]);
    });
});
