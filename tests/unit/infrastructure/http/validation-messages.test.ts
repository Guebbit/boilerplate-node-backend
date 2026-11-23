/**
 * @module
 * `src/infrastructure/http/validation-messages.ts` — Zod's global error map.
 *
 * Driven through real schemas rather than by calling the mapper: it is installed on the Zod
 * singleton, so parsing is the only path a request ever takes through it. Every branch is asserted
 * against the shipped English copy, rendered with the field's label, because the failure this file exists to prevent is a message
 * silently falling back to Zod's own English — which looks like a message, not like a bug.
 */

import { z } from 'zod';
import { registerValidationMessages } from '@infrastructure/http/validation-messages';
import { readLocaleDictionary, runWithLocale, translator } from '@infrastructure/i18n';

/** The shipped English dictionary. */
const dictionary = readLocaleDictionary('en') as {
    validation: Record<string, string> & { attributes: Record<string, string> };
};

/** The shipped English validation copy, so no expectation retypes a sentence. */
const copy = dictionary.validation;

/** A sentence with its placeholders filled, rendered by the same `t` the map uses. */
const render = (key: string, values: Record<string, string>): string =>
    translator('en')(`validation.${key}`, values);

/** The first issue's message from a parse that must fail. */
const messageOf = (schema: z.ZodType, value: unknown): string => {
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    return result.error!.issues[0].message;
};

/** Every issue message from a parse that must fail. */
const messagesOf = (schema: z.ZodType, value: unknown): string[] => {
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    return result.error!.issues.map(({ message }) => message);
};

/** The one-field object every sentence is tested through, so the label is part of the claim. */
const field = (name: string, schema: z.ZodType) => z.object({ [name]: schema });

beforeAll(() => {
    registerValidationMessages();
});

describe('a missing field versus a wrongly-typed one', () => {
    it('names an absent field as required, with its label', () => {
        expect(messageOf(field('email', z.string()), {})).toBe(
            render('required', { attribute: copy.attributes.email })
        );
    });

    it.each([
        ['string', z.string(), 42, 'type-string'],
        ['number', z.number(), 'x', 'type-number'],
        ['integer', z.number().int(), 3.5, 'type-integer'],
        ['boolean', z.boolean(), 'x', 'type-boolean'],
        ['array', z.array(z.string()), 'x', 'type-array'],
        ['object', z.object({}), 'x', 'type-object'],
        ['other', z.date(), 'x', 'type-other']
    ])('names a wrongly-typed %s in its own words', (_name, schema, value, key) => {
        expect(messageOf(field('pageSize', schema), { pageSize: value })).toBe(
            render(key, { attribute: copy.attributes.pageSize })
        );
    });

    it('does not answer "required" for a value that is present but null', () => {
        expect(messageOf(field('name', z.string()), { name: null })).not.toBe(
            render('required', { attribute: copy.attributes.name })
        );
    });
});

describe('the label of the field', () => {
    it('uses the innermost labelled segment and skips indexes', () => {
        const schema = z.object({ entries: z.array(z.object({ pageSize: z.number() })) });

        expect(messageOf(schema, { entries: [{ pageSize: 'x' }] })).toContain(
            copy.attributes.pageSize
        );
    });

    it('skips an unlabelled segment and falls back to the one above it', () => {
        const schema = z.object({ fields: z.record(z.string(), z.string().min(1)) });

        expect(messageOf(schema, { fields: { zz: '' } })).toContain(copy.attributes.fields);
    });

    it('falls back to the neutral phrase when nothing on the path is labelled', () => {
        expect(messageOf(field('unlabelledField', z.string()), {})).toBe(
            render('required', { attribute: copy['attribute-fallback'] })
        );
    });

    it('answers in the language of the request', () => {
        const italian = readLocaleDictionary('it') as typeof dictionary;
        const message = runWithLocale('it', () => messageOf(field('email', z.string()), {}));

        expect(message).toBe(
            translator('it')('validation.required', {
                attribute: italian.validation.attributes.email
            })
        );
    });
});

describe('size constraints carry the unit they measure', () => {
    it('measures a short string in characters', () => {
        expect(messageOf(field('name', z.string().min(3)), { name: 'ab' })).toBe(
            render('too-small-string', { attribute: copy.attributes.name, minimum: '3' })
        );
    });

    it('answers "must not be empty" for a one-character minimum', () => {
        expect(messageOf(field('name', z.string().min(1)), { name: '' })).toBe(
            render('filled', { attribute: copy.attributes.name })
        );
    });

    it('measures a long string in characters', () => {
        expect(messageOf(field('name', z.string().max(2)), { name: 'abc' })).toBe(
            render('too-big-string', { attribute: copy.attributes.name, maximum: '2' })
        );
    });

    it('does not pluralise a one-character ceiling', () => {
        expect(messageOf(field('name', z.string().max(1)), { name: 'ab' })).toBe(
            render('too-big-string-one', { attribute: copy.attributes.name })
        );
    });

    it('measures a small number as a value', () => {
        expect(messageOf(field('page', z.number().min(5)), { page: 1 })).toBe(
            render('too-small-number', { attribute: copy.attributes.page, minimum: '5' })
        );
    });

    it('says "greater than" for an exclusive minimum, not "at least"', () => {
        expect(messageOf(field('value', z.number().gt(0)), { value: 0 })).toBe(
            render('too-small-number-exclusive', {
                attribute: copy.attributes.value,
                minimum: '0'
            })
        );
    });

    it('measures a large number as a value', () => {
        expect(messageOf(field('page', z.number().max(5)), { page: 9 })).toBe(
            render('too-big-number', { attribute: copy.attributes.page, maximum: '5' })
        );
    });

    it('says "less than" for an exclusive maximum', () => {
        expect(messageOf(field('page', z.number().lt(5)), { page: 5 })).toBe(
            render('too-big-number-exclusive', { attribute: copy.attributes.page, maximum: '5' })
        );
    });

    it('measures a short array in items', () => {
        expect(
            messageOf(field('permissions', z.array(z.string()).min(2)), { permissions: ['a'] })
        ).toBe(render('too-small-items', { attribute: copy.attributes.permissions, minimum: '2' }));
    });

    it('does not pluralise a one-item minimum', () => {
        expect(
            messageOf(field('permissions', z.array(z.string()).min(1)), { permissions: [] })
        ).toBe(render('too-small-items-one', { attribute: copy.attributes.permissions }));
    });

    it('measures a long array in items', () => {
        expect(
            messageOf(field('permissions', z.array(z.string()).max(2)), {
                permissions: ['a', 'b', 'c']
            })
        ).toBe(render('too-big-items', { attribute: copy.attributes.permissions, maximum: '2' }));
    });

    it('does not pluralise a one-item ceiling', () => {
        expect(
            messageOf(field('permissions', z.array(z.string()).max(1)), { permissions: ['a', 'b'] })
        ).toBe(render('too-big-items-one', { attribute: copy.attributes.permissions }));
    });

    it('measures a set in items, not characters', () => {
        expect(
            messageOf(field('permissions', z.set(z.string()).min(2)), {
                permissions: new Set(['a'])
            })
        ).toBe(render('too-small-items', { attribute: copy.attributes.permissions, minimum: '2' }));
    });
});

describe('formats worth their own sentence', () => {
    it.each([
        ['email', z.email(), 'not-an-email'],
        ['url', z.url(), 'not-a-url'],
        ['uuid', z.uuid(), 'not-a-uuid'],
        ['datetime', z.iso.datetime(), 'not-a-datetime'],
        ['date', z.iso.date(), 'not-a-date'],
        ['time', z.iso.time(), 'not-a-time']
    ])('answers the %s sentence', (format, schema, value) => {
        expect(messageOf(field('value', schema), { value })).toBe(
            render(`format-${format}`, { attribute: copy.attributes.value })
        );
    });

    /** An unnamed format — a bare regex — falls to the generic sentence, never to a missing key. */
    it('answers the generic format sentence for an unnamed format', () => {
        expect(messageOf(field('code', z.string().regex(/^\d+$/)), { code: 'abc' })).toBe(
            render('invalid-format', { attribute: copy.attributes.code })
        );
    });
});

describe('the remaining named constraints', () => {
    it('names the divisor a value had to be a multiple of', () => {
        expect(messageOf(field('value', z.number().multipleOf(5)), { value: 7 })).toBe(
            render('not-multiple-of', { attribute: copy.attributes.value, divisor: '5' })
        );
    });

    it('lists every unrecognised key, comma-separated', () => {
        const schema = z.strictObject({ known: z.string() });

        expect(messageOf(schema, { known: 'a', alpha: 1, beta: 2 })).toBe(
            render('unrecognized-keys', { keys: 'alpha, beta' })
        );
    });

    it('lists the values an enum accepts', () => {
        expect(messageOf(field('status', z.enum(['red', 'blue'])), { status: 'green' })).toBe(
            render('invalid-value', { attribute: copy.attributes.status, values: 'red, blue' })
        );
    });
});

describe('nothing falls through to Zod English', () => {
    /** A bare `.refine()` carries no message of its own and used to answer Zod's "Invalid input". */
    it('answers the generic sentence for a refinement with no message', () => {
        expect(
            messageOf(
                field(
                    'name',
                    z.string().refine(() => false)
                ),
                { name: 'anything' }
            )
        ).toBe(render('invalid', { attribute: copy.attributes.name }));
    });

    it('answers a translated sentence for a union that matched nothing', () => {
        const schema = field('value', z.union([z.literal('a'), z.literal('b')]));

        expect(messageOf(schema, { value: 'c' })).not.toMatch(/Invalid input/);
    });

    it('translates every issue of a multi-error parse', () => {
        const schema = z.object({
            name: z.string().min(3),
            page: z.number().max(10),
            email: z.email()
        });

        expect(messagesOf(schema, { name: 'a', page: 99, email: 'nope' })).toEqual([
            render('too-small-string', { attribute: copy.attributes.name, minimum: '3' }),
            render('too-big-number', { attribute: copy.attributes.page, maximum: '10' }),
            render('format-email', { attribute: copy.attributes.email })
        ]);
    });
});
