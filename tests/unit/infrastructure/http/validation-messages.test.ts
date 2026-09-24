/**
 * @module
 * `src/infrastructure/http/validation-messages.ts` — Zod's global error map.
 *
 * Driven through real schemas rather than by calling the mapper: it is installed on the Zod
 * singleton, so parsing is the only path a request ever takes through it. Every branch is asserted
 * against the shipped English copy, because the failure this file exists to prevent is a message
 * silently falling back to Zod's own English — which looks like a message, not like a bug.
 */

import { z } from 'zod';
import { registerValidationMessages } from '@infrastructure/http/validation-messages';
import { readLocaleDictionary } from '@infrastructure/i18n';

/** The shipped English validation copy, so no expectation retypes a sentence. */
const copy = (readLocaleDictionary('en') as { validation: Record<string, string> }).validation;

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

beforeAll(() => {
    registerValidationMessages();
});

describe('a missing field versus a wrongly-typed one', () => {
    /**
     * Two different mistakes to whoever has to fix them: one is a field left out, the other a
     * field filled in wrongly. Zod reports both as `invalid_type`.
     */
    it('names an absent field as required', () => {
        expect(messageOf(z.object({ name: z.string() }), {})).toBe(copy.required);
    });

    it('names a wrongly-typed field by the type it expected', () => {
        expect(messageOf(z.object({ name: z.string() }), { name: 42 })).toBe(
            copy['invalid-type'].replace('{{expected}}', 'string')
        );
    });

    it('does not answer "required" for a value that is present but null', () => {
        expect(messageOf(z.object({ name: z.string() }), { name: null })).not.toBe(copy.required);
    });
});

describe('size constraints carry the unit they measure', () => {
    /**
     * A string's minimum counts characters, an array's counts items and a number's is the value
     * itself. One "too small" for all three would leave the reader guessing the unit.
     */
    it('measures a short string in characters', () => {
        expect(messageOf(z.string().min(3), 'ab')).toBe(
            copy['too-small-string'].replace('{{minimum}}', '3')
        );
    });

    it('measures a long string in characters', () => {
        expect(messageOf(z.string().max(2), 'abc')).toBe(
            copy['too-big-string'].replace('{{maximum}}', '2')
        );
    });

    it('measures a small number as a value', () => {
        expect(messageOf(z.number().min(5), 1)).toBe(
            copy['too-small-number'].replace('{{minimum}}', '5')
        );
    });

    it('measures a large number as a value', () => {
        expect(messageOf(z.number().max(5), 9)).toBe(
            copy['too-big-number'].replace('{{maximum}}', '5')
        );
    });

    it('measures a short array in items', () => {
        expect(messageOf(z.array(z.string()).min(2), ['a'])).toBe(
            copy['too-small-items'].replace('{{minimum}}', '2')
        );
    });

    it('measures a long array in items', () => {
        expect(messageOf(z.array(z.string()).max(1), ['a', 'b'])).toBe(
            copy['too-big-items'].replace('{{maximum}}', '1')
        );
    });

    it('measures a set in items, not characters', () => {
        expect(messageOf(z.set(z.string()).min(2), new Set(['a']))).toBe(
            copy['too-small-items'].replace('{{minimum}}', '2')
        );
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
        expect(messageOf(schema, value)).toBe(copy[`format-${format}`]);
    });

    /**
     * An unnamed format — a bare regex — falls to the generic sentence rather than to a key that
     * does not exist, which would render as the key itself.
     */
    it('answers the generic format sentence for an unnamed format', () => {
        expect(messageOf(z.string().regex(/^\d+$/), 'abc')).toBe(copy['invalid-format']);
    });
});

describe('the remaining named constraints', () => {
    it('names the divisor a value had to be a multiple of', () => {
        expect(messageOf(z.number().multipleOf(5), 7)).toBe(
            copy['not-multiple-of'].replace('{{divisor}}', '5')
        );
    });

    it('lists every unrecognised key, comma-separated', () => {
        const schema = z.strictObject({ known: z.string() });
        const message = messageOf(schema, { known: 'a', alpha: 1, beta: 2 });

        expect(message).toBe(copy['unrecognized-keys'].replace('{{keys}}', 'alpha, beta'));
    });

    it('lists the values an enum accepts', () => {
        expect(messageOf(z.enum(['red', 'blue']), 'green')).toBe(
            copy['invalid-value'].replace('{{values}}', 'red, blue')
        );
    });
});

describe('nothing falls through to Zod English', () => {
    /**
     * The catch-all. A bare `.refine()` carries no message of its own, and before this map it
     * answered Zod's "Invalid input" — untranslated, on a form a person is reading.
     */
    it('answers the generic sentence for a refinement with no message', () => {
        expect(
            messageOf(
                z.string().refine(() => false),
                'anything'
            )
        ).toBe(copy.invalid);
    });

    it('answers the generic sentence for a union that matched nothing', () => {
        const schema = z.union([z.literal('a'), z.literal('b')]);

        expect(messageOf(schema, 'c')).not.toMatch(/Invalid input/);
    });

    /**
     * The property the whole file exists for, asserted once over a schema that breaks several
     * rules at once: every message is ours, none is Zod's.
     */
    it('translates every issue of a multi-error parse', () => {
        const schema = z.object({
            name: z.string().min(3),
            age: z.number().max(10),
            email: z.email()
        });
        const messages = messagesOf(schema, { name: 'a', age: 99, email: 'nope' });
        const known = new Set(Object.values(copy).map((sentence) => sentence.split('{{')[0]));

        expect(messages).toHaveLength(3);
        for (const message of messages)
            expect([...known].some((prefix) => message.startsWith(prefix))).toBe(true);
    });
});
