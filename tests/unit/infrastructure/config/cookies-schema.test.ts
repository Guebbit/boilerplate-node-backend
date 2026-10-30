/**
 * The schema of `shared/rules/cookies.yaml`: what it refuses, and that the committed file
 * satisfies it. The names and lifetimes are pinned where the cookies are set.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '@tests/paths';
import { cookiesSchema } from '../../../../src/infrastructure/config/shared-rules/cookies';

/** One valid row, to break one field at a time. */
const row = {
    name: '__Host-thing',
    setter: 'backend',
    kind: 'cookie',
    purpose: 'Holds a thing.',
    necessity: 'necessary',
    secret: false
};

/**
 * A document holding the given rows.
 *
 * @param cookies - rows by id
 */
const documentOf = (cookies: Record<string, unknown>): unknown => ({ cookies });

describe('shared/rules/cookies.yaml', () => {
    it('satisfies its schema', () => {
        const committed = parse(
            readFileSync(path.join(REPO_ROOT, 'shared/rules/cookies.yaml'), 'utf8')
        ) as unknown;

        expect(cookiesSchema.safeParse(committed).success).toBe(true);
    });
});

describe('the cookies schema', () => {
    it('accepts a row with a constant lifetime', () => {
        expect(
            cookiesSchema.safeParse(documentOf({ thing: { ...row, maxAgeMs: 1000 } })).success
        ).toBe(true);
    });

    it('accepts a row with a lifetime in words', () => {
        expect(
            cookiesSchema.safeParse(documentOf({ thing: { ...row, lifetime: 'challenge' } }))
                .success
        ).toBe(true);
    });

    it.each([
        ['an empty inventory', documentOf({})],
        ['an id that is not camelCase', documentOf({ 'Not-Camel': row })],
        ['an unknown field', documentOf({ thing: { ...row, httpOnly: true } })],
        ['an unknown setter', documentOf({ thing: { ...row, setter: 'cdn' } })],
        ['a lifetime of zero', documentOf({ thing: { ...row, maxAgeMs: 0 } })],
        [
            'both maxAgeMs and lifetime',
            documentOf({ thing: { ...row, maxAgeMs: 1, lifetime: 'challenge' } })
        ],
        ['the same name twice', documentOf({ one: row, two: row })]
    ])('refuses %s', (_title, document) => {
        expect(cookiesSchema.safeParse(document).success).toBe(false);
    });
});
